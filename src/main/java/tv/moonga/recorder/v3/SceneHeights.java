package tv.moonga.recorder.v3;

import net.runelite.api.*;
import net.runelite.api.coords.LocalPoint;

final class SceneHeights {
  static int actor(Client client, Actor actor) {
    WorldView w = actor.getWorldView();
    LocalPoint p = actor.getLocalLocation();
    if (w == null || p == null) return 0;
    int plane =
        actor.getWorldLocation() == null ? w.getPlane() : actor.getWorldLocation().getPlane();
    return Perspective.getFootprintTileHeight(client, p, plane, actor.getFootprintSize());
  }

  static int[] corners(WorldView w, Tile tile, int x, int z) {
    int[][][] levels = w.getTileHeights();
    int level = tile.getRenderLevel();
    if (level < 0 || level >= levels.length)
      throw new IllegalArgumentException("Invalid render level");
    int[][] h = levels[level];
    return new int[] {h[x][z], h[x + 1][z], h[x + 1][z + 1], h[x][z + 1]};
  }
}
