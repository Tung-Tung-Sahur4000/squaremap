const REGION_SIZE = 512; // blocks per region tile
const RES = 4; // biome sample resolution in blocks (Minecraft biomes are 4x4)
const GRID = REGION_SIZE / RES; // 128 samples per region axis
const RETRY_MS = 15000; // how long to wait before refetching a missing region

/**
 * Client-side biome lookup. Biome data is exported by the server as compact
 * per-region files (palette + run-length-encoded indices) at 4-block
 * resolution, mirroring how Minecraft stores biomes. Regions are fetched lazily
 * the first time the cursor enters them and cached for the session.
 *
 * The lookup degrades gracefully: if a region file is missing (e.g. that region
 * has not been rendered yet, or biome export is disabled server-side) the name
 * is reported as null and nothing is shown. Missing regions are retried after a
 * short cooldown, so biomes appear once the region is eventually rendered
 * without needing a page reload.
 */
class BiomeLayer {
    constructor() {
        /** @type {Map<string, {palette: string[] | null, cells: Uint16Array | null, loading: boolean, retryAt: number}>} */
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
            region = { palette: null, cells: null, loading: false, retryAt: 0 };
            this.regions.set(key, region);
        }

        if (region.cells !== null && region.palette !== null) {
            const col = (blockX - rx * REGION_SIZE) >> 2;
            const row = (blockZ - rz * REGION_SIZE) >> 2;
            const idx = region.cells[row * GRID + col];
            return region.palette[idx] ?? null;
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
                    region.cells = decodeRle(json.rle, GRID * GRID);
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
 * @param {number[]} rle flat [value, length, value, length, ...]
 * @param {number} size
 * @returns {Uint16Array}
 */
function decodeRle(rle, size) {
    const out = new Uint16Array(size);
    let p = 0;
    for (let i = 0; i + 1 < rle.length && p < size; i += 2) {
        const value = rle[i];
        const len = rle[i + 1];
        for (let j = 0; j < len && p < size; j++) {
            out[p++] = value;
        }
    }
    return out;
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
