package xyz.jpenilla.squaremap.common.data;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.core.QuartPos;
import net.minecraft.core.Registry;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeManager;
import net.minecraft.world.level.levelgen.Heightmap;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.checkerframework.checker.nullness.qual.Nullable;
import org.checkerframework.framework.qual.DefaultQualifier;
import xyz.jpenilla.squaremap.common.Logging;
import xyz.jpenilla.squaremap.common.task.render.AbstractRender;
import xyz.jpenilla.squaremap.common.util.FileUtil;
import xyz.jpenilla.squaremap.common.util.Util;
import xyz.jpenilla.squaremap.common.util.chunksnapshot.ChunkSnapshot;

/**
 * Exports the surface biome of a region as a compact static file so the web
 * frontend can display the biome name under the cursor.
 *
 * <p>Biomes are sampled at Minecraft's native 4-block resolution, producing a
 * {@value #GRID}x{@value #GRID} grid per 512-block region. The grid is stored
 * as a small palette of biome ids plus a run-length-encoded index array, which
 * keeps the files tiny (typically a few KB, mostly long runs of the same
 * biome). Files are written to {@code tiles/<world>/biomes/<x>_<z>.json}.</p>
 *
 * <p>Sampling reuses the chunk snapshots already loaded for the pixel render of
 * the same region, so it adds negligible IO and no extra chunk loads.</p>
 */
@DefaultQualifier(NonNull.class)
public final class BiomeExport {
    private static final int REGION_BLOCKS = 512;
    private static final int RES = 4; // biomes are stored per 4x4 columns
    private static final int GRID = REGION_BLOCKS / RES; // 128 samples per axis
    private static final int FALLBACK_Y = 64; // used only when a chunk snapshot is unexpectedly missing

    private BiomeExport() {
    }

    public static void export(
        final MapWorldInternal mapWorld,
        final RegionCoordinate region,
        final AbstractRender.ChunkSnapshotManager chunks
    ) {
        try {
            final Map<String, Object> data = sample(mapWorld.serverLevel(), region, chunks);
            final var file = mapWorld.tilesPath()
                .resolve("biomes")
                .resolve(region.x() + "_" + region.z() + ".json");
            FileUtil.atomicWriteJsonAsync(file, data);
        } catch (final Exception ex) {
            Logging.logger().warn("Failed to export biome data for region [{}, {}] in {}",
                region.x(), region.z(), mapWorld.identifier().asString(), ex);
        }
    }

    private static Map<String, Object> sample(
        final ServerLevel level,
        final RegionCoordinate region,
        final AbstractRender.ChunkSnapshotManager chunks
    ) {
        final Registry<Biome> registry = Util.biomeRegistry(level);

        // Resolve biomes through the same snapshot-backed source the renderer
        // uses, so the exported biome matches what is drawn on the map.
        final BiomeManager biomeManager = level.getBiomeManager().withDifferentSource(
            (quartX, quartY, quartZ) -> {
                final ChunkPos chunkPos = new ChunkPos(QuartPos.toSection(quartX), QuartPos.toSection(quartZ));
                final @Nullable ChunkSnapshot chunk = chunks.snapshotDirect(chunkPos).join();
                final BiomeManager.NoiseBiomeSource source = chunk == null
                    ? level::getUncachedNoiseBiome
                    : chunk;
                return source.getNoiseBiome(quartX, quartY, quartZ);
            }
        );

        final int baseX = region.getBlockX();
        final int baseZ = region.getBlockZ();

        final List<String> palette = new ArrayList<>();
        final Map<String, Integer> paletteIndex = new HashMap<>();
        final List<Integer> rle = new ArrayList<>();

        final BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        int runValue = -1;
        int runLength = 0;

        // Row-major (z outer, x inner); the frontend indexes with row * GRID + col.
        for (int row = 0; row < GRID; row++) {
            final int blockZ = baseZ + row * RES + RES / 2;
            for (int col = 0; col < GRID; col++) {
                final int blockX = baseX + col * RES + RES / 2;

                final ChunkPos chunkPos = new ChunkPos(blockX >> 4, blockZ >> 4);
                final @Nullable ChunkSnapshot chunk = chunks.snapshotDirect(chunkPos).join();
                // Sample at the surface; fall back to a nominal height for the
                // rare case of an ungenerated (null) chunk snapshot.
                final int y = chunk == null
                    ? FALLBACK_Y
                    : chunk.getHeight(Heightmap.Types.WORLD_SURFACE, blockX & 15, blockZ & 15);

                pos.set(blockX, y, blockZ);
                final Biome biome = biomeManager.getBiome(pos).value();
                final @Nullable Identifier key = registry.getKey(biome);
                final String id = key == null ? "minecraft:unknown" : key.toString();

                int index = paletteIndex.computeIfAbsent(id, $ -> {
                    palette.add(id);
                    return palette.size() - 1;
                });

                if (index == runValue) {
                    runLength++;
                } else {
                    if (runLength > 0) {
                        rle.add(runValue);
                        rle.add(runLength);
                    }
                    runValue = index;
                    runLength = 1;
                }
            }
        }
        if (runLength > 0) {
            rle.add(runValue);
            rle.add(runLength);
        }

        final Map<String, Object> data = new LinkedHashMap<>();
        data.put("x", region.x());
        data.put("z", region.z());
        data.put("res", RES);
        data.put("palette", palette);
        data.put("rle", rle);
        return data;
    }
}
