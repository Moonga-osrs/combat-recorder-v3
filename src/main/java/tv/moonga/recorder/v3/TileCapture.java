package tv.moonga.recorder.v3;

import static tv.moonga.recorder.v3.CombatRecorderPlugin.map;

import java.util.*;
import net.runelite.api.*;
import net.runelite.api.coords.*;

/** Immutable collision revisions; references in frames make missing records detectable. */
final class TileCapture {
  static final int[] DX = {0, 1, 1, 1, 0, -1, -1, -1}, DY = {1, 1, 0, -1, -1, -1, 0, 1};
  private final Map<String, Map<String, Object>> previous = new HashMap<>();
  private long revision;

  void clear() {
    previous.clear();
  }

  static Object footprint(Actor actor) {
    WorldPoint p = actor.getWorldLocation();
    if (p == null) return null;
    Integer size = tileSize(actor);
    if (size == null) return null;
    // Server location is the southwest anchor, not the interpolated model center.
    return map(
        "x",
        p.getX(),
        "y",
        p.getY(),
        "plane",
        p.getPlane(),
        "width",
        size,
        "height",
        size,
        "tileCount",
        size * size,
        "units",
        "tiles");
  }

  static Integer tileSize(Actor actor) {
    if (actor instanceof Player) return 1;
    if (!(actor instanceof NPC)) return null;
    NPC npc = (NPC) actor;
    NPCComposition composition = npc.getTransformedComposition();
    if (composition == null) composition = npc.getComposition();
    return composition == null || composition.getSize() < 1 ? null : composition.getSize();
  }

  static boolean open(int flag) {
    return (flag & (CollisionDataFlag.BLOCK_MOVEMENT_FULL | 0x1000000)) == 0;
  }

  List<Map<String, Object>> capture(WorldView view) {
    List<Map<String, Object>> result = new ArrayList<>();
    CollisionData[] maps = view.getCollisionMaps();
    if (maps == null) return result;
    for (int plane = 0; plane < maps.length; plane++) {
      if (maps[plane] == null || maps[plane].getFlags() == null) continue;
      int[][] raw = maps[plane].getFlags();
      int width = raw.length, height = width == 0 ? 0 : raw[0].length;
      int[] flags = new int[width * height];
      int walkable = 0, unknown = 0;
      for (int x = 0; x < width; x++)
        for (int y = 0; y < height; y++) {
          int flag = raw[x][y];
          flags[y * width + x] = flag;
          if ((flag & 0x1000000) != 0) unknown++;
          else if (open(flag)) walkable++;
        }
      String key = view.getId() + ":" + plane;
      Map<String, Object> old = previous.get(key);
      if (old != null
          && old.get("baseX").equals(view.getBaseX())
          && old.get("baseY").equals(view.getBaseY())
          && old.get("width").equals(width)
          && old.get("height").equals(height)
          && Arrays.equals((int[]) old.get("flags"), flags)) {
        result.add(old);
        continue;
      }
      int[] moves = new int[flags.length];
      for (int x = 0; x < width; x++)
        for (int y = 0; y < height; y++) {
          if (!open(flags[y * width + x])) continue;
          WorldArea area = new WorldArea(view.getBaseX() + x, view.getBaseY() + y, 1, 1, plane);
          for (int dir = 0; dir < 8; dir++) {
            int nx = x + DX[dir], ny = y + DY[dir];
            if (nx < 0 || ny < 0 || nx >= width || ny >= height || !open(flags[ny * width + nx]))
              continue;
            // Use RuneLite's movement rules, including diagonal corner clipping.
            if (area.canTravelInDirection(view, DX[dir], DY[dir])) moves[y * width + x] |= 1 << dir;
          }
        }
      Map<String, Object> data =
          map(
              "revision",
              ++revision,
              "worldView",
              view.getId(),
              "plane",
              plane,
              "baseX",
              view.getBaseX(),
              "baseY",
              view.getBaseY(),
              "width",
              width,
              "height",
              height,
              "encoding",
              "row-major y*width+x; moves bits N,NE,E,SE,S,SW,W,NW",
              "flags",
              flags,
              "moves",
              moves,
              "walkable",
              walkable,
              "unknown",
              unknown,
              "blocked",
              flags.length - walkable - unknown);
      previous.put(key, data);
      result.add(data);
    }
    return result;
  }
}
