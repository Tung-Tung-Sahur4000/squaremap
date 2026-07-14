const REGION_SIZE = 512; // blocks per region tile
const RES = 4; // biome sample resolution in blocks (Minecraft biomes are 4x4)
const GRID = REGION_SIZE / RES; // 128 samples per region axis
const CELLS = GRID * GRID; // 16384 samples per region
const RETRY_MS = 15000; // how long to wait before refetching a missing region
const MAX_REGIONS = 512; // cap cached regions so long panning sessions stay bounded

/**
 * Client-side biome lookup. Biome data is exported by the server as compact
 * per-region files (palette + run-length-encoded indices) at 4-block
 * resolution, mirroring how Minecraft stores biomes. Regions are fetched lazily
 * the first time the cursor enters them and cached for the session.
 *
 * Memory: the run-length encoding is kept compact and looked up with a binary
 * search over run start offsets, rather than expanded into a full 16384-cell
 * grid. Since biomes are mostly long uniform runs this is a few hundred bytes
 * per region instead of ~32 KB. The cache is also capped at {@link MAX_REGIONS}
 * with oldest-first eviction so a long panning session can't grow without bound.
 *
 * The lookup degrades gracefully: if a region file is missing (e.g. that region
 * has not been rendered yet, or biome export is disabled server-side) the name
 * is reported as null and nothing is shown. Missing regions are retried after a
 * short cooldown, so biomes appear once the region is eventually rendered
 * without needing a page reload.
 */
class BiomeLayer {
    constructor() {
        /**
         * @type {Map<string, {palette: string[] | null, starts: Int32Array | null,
         *   values: Uint16Array | null, total: number, loading: boolean, retryAt: number}>}
         */
        this.regions = new Map();
    }

    /**
     * Biome display name at the given block coordinate, or null if not (yet)
     * available. Triggers a background fetch on first access to a region, and a
     * refetch if a previous attempt found nothing and the cooldown has elapsed.
     * @param {string} world
     * @param {number} blockX
     * @param {number} blockZ
     * @returns {string | null}
     */
    nameAt(world, blockX, blockZ) {
        const rx = blockX >> 9; // floor(blockX / 512)
        const rz = blockZ >> 9;
        const key = `${world}/${rx}_${rz}`;

        let region = this.regions.get(key);
        if (region === undefined) {
            if (this.regions.size >= MAX_REGIONS) {
                this.regions.delete(this.regions.keys().next().value); // evict oldest
            }
            region = { palette: null, starts: null, values: null, total: 0, loading: false, retryAt: 0 };
            this.regions.set(key, region);
        }

        if (region.starts !== null && region.palette !== null) {
            const col = (blockX - rx * REGION_SIZE) >> 2;
            const row = (blockZ - rz * REGION_SIZE) >> 2;
            const idx = row * GRID + col;
            if (idx >= region.total) {
                return null; // cell not covered by the data
            }
            const paletteIdx = region.values[runIndexAt(region.starts, idx)];
            return region.palette[paletteIdx] ?? null;
        }

        // Not loaded: fetch (or refetch after the cooldown), but never overlap requests.
        if (!region.loading && Date.now() >= region.retryAt) {
            this.#fetchRegion(world, rx, rz, region);
        }
        return null;
    }

    /** Drop cached regions for a world so fresh data is fetched after a reload. */
    invalidate(world) {
        for (const key of this.regions.keys()) {
            if (key.startsWith(`${world}/`)) {
                this.regions.delete(key);
            }
        }
    }

    #fetchRegion(world, rx, rz, region) {
        region.loading = true;
        fetch(`tiles/${world}/biomes/${rx}_${rz}.json`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (json !== null && Array.isArray(json.palette) && Array.isArray(json.rle)) {
                    region.palette = json.palette.map(prettyBiomeName);
                    indexRle(json.rle, region);
                } else {
                    region.retryAt = Date.now() + RETRY_MS; // missing / malformed: try again later
                }
            })
            .catch(() => {
                region.retryAt = Date.now() + RETRY_MS; // network error: try again later
            })
            .finally(() => {
                region.loading = false;
            });
    }
}

/**
 * Index a flat run-length array [value, length, value, length, ...] into compact
 * parallel arrays (run start offset + run value) on the region, without
 * expanding the full cell grid.
 * @param {number[]} rle
 * @param {{starts: Int32Array | null, values: Uint16Array | null, total: number}} region
 */
function indexRle(rle, region) {
    const runs = rle.length >> 1;
    const starts = new Int32Array(runs);
    const values = new Uint16Array(runs);
    let offset = 0;
    for (let i = 0; i < runs; i++) {
        starts[i] = offset;
        values[i] = rle[2 * i];
        offset += rle[2 * i + 1];
    }
    region.starts = starts;
    region.values = values;
    region.total = Math.min(offset, CELLS);
}

/**
 * Rightmost run whose start offset is <= idx (binary search).
 * @param {Int32Array} starts ascending run start offsets, starts[0] === 0
 * @param {number} idx
 * @returns {number}
 */
function runIndexAt(starts, idx) {
    let lo = 0;
    let hi = starts.length - 1;
    let run = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (starts[mid] <= idx) {
            run = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return run;
}

/**
 * "minecraft:snowy_taiga" -> "Snowy Taiga"
 * @param {string} id
 * @returns {string}
 */
function prettyBiomeName(id) {
    const path = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
    return path
        .split("_")
        .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : word))
        .join(" ");
}

export const biomeLayer = new BiomeLayer();
