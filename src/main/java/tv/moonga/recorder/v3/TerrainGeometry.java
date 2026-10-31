package tv.moonga.recorder.v3;

import static tv.moonga.recorder.v3.CombatRecorderPlugin.map;

import java.util.Map;
import net.runelite.api.*;

final class TerrainGeometry {
  static Map<String, Object> paint(WorldView world, Tile tile, int x, int z) {
    SceneTilePaint p = tile.getSceneTilePaint();
    return map(
        "x",
        new int[] {x * 128, (x + 1) * 128, (x + 1) * 128, x * 128},
        "y",
        SceneHeights.corners(world, tile, x, z),
        "z",
        new int[] {z * 128, z * 128, (z + 1) * 128, (z + 1) * 128},
        "a",
        new int[] {2, 0},
        "b",
        new int[] {3, 1},
        "c",
        new int[] {1, 3},
        "ca",
        new int[] {p.getNeColor(), p.getSwColor()},
        "cb",
        new int[] {p.getNwColor(), p.getSeColor()},
        "cc",
        new int[] {p.getSeColor(), p.getNwColor()},
        "textures",
        new int[] {p.getTexture(), p.getTexture()},
        "terrainUv",
        true,
        "paint",
        true);
  }
}
