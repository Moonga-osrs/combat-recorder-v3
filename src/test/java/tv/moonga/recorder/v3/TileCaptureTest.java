package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.*;
import net.runelite.api.*;
import net.runelite.api.coords.*;
import org.junit.Test;

public class TileCaptureTest {
  private WorldView world(int[][] flags) {
    WorldView view = mock(WorldView.class);
    when(view.getBaseX()).thenReturn(3200);
    when(view.getBaseY()).thenReturn(6400);
    when(view.getSizeX()).thenReturn(flags.length);
    when(view.getSizeY()).thenReturn(flags[0].length);
    CollisionData data = mock(CollisionData.class);
    when(data.getFlags()).thenReturn(flags);
    when(view.getCollisionMaps()).thenReturn(new CollisionData[] {data});
    return view;
  }

  @Test
  public void wallsCornersAndBlockedTerrainAreRecorded() {
    int[][] flags = new int[5][5];
    flags[2][3] = CollisionDataFlag.BLOCK_MOVEMENT_SOUTH;
    flags[3][2] = CollisionDataFlag.BLOCK_MOVEMENT_FULL;
    flags[0][0] = 0x1000000;
    Map<String, Object> c = new TileCapture().capture(world(flags)).get(0);
    int mask = ((int[]) c.get("moves"))[2 * 5 + 2];
    assertEquals(0, mask & 1); // north wall
    assertEquals(0, mask & 4); // east object
    assertEquals(0, mask & 2); // northeast cannot cut corner
    assertNotEquals(0, mask & 16); // south open
    assertEquals(23, c.get("walkable"));
    assertEquals(1, c.get("unknown"));
    assertEquals(1, c.get("blocked"));
  }

  @Test
  public void revisionsAreImmutableAndChangeForDoorsBaseAndReset() {
    int[][] flags = new int[5][5];
    WorldView w = world(flags);
    TileCapture t = new TileCapture();
    Map<String, Object> first = t.capture(w).get(0);
    assertSame(first, t.capture(w).get(0));
    flags[2][2] = CollisionDataFlag.BLOCK_MOVEMENT_OBJECT;
    Map<String, Object> second = t.capture(w).get(0);
    assertNotEquals(first.get("revision"), second.get("revision"));
    assertEquals(0, ((int[]) first.get("flags"))[12]);
    when(w.getBaseX()).thenReturn(3300);
    Map<String, Object> third = t.capture(w).get(0);
    assertNotEquals(second.get("revision"), third.get("revision"));
    t.clear();
    assertNotEquals(third.get("revision"), t.capture(w).get(0).get("revision"));
  }

  @Test
  public void footprintUsesServerAnchorAndIncludesAllBossTiles() {
    NPC npc = mock(NPC.class);
    when(npc.getWorldLocation()).thenReturn(new WorldPoint(100, 200, 2));
    when(npc.getFootprintSize()).thenReturn(153);
    NPCComposition composition = mock(NPCComposition.class);
    when(composition.getSize()).thenReturn(3);
    when(npc.getTransformedComposition()).thenReturn(composition);
    Map<?, ?> area = (Map<?, ?>) TileCapture.footprint(npc);
    assertEquals(100, area.get("x"));
    assertEquals(200, area.get("y"));
    assertEquals(9, area.get("tileCount"));
    Player player = mock(Player.class);
    when(player.getWorldLocation()).thenReturn(new WorldPoint(100, 200, 2));
    when(player.getFootprintSize()).thenReturn(51);
    assertEquals(1, ((Map<?, ?>) TileCapture.footprint(player)).get("tileCount"));
    when(composition.getSize()).thenReturn(5);
    assertEquals(25, ((Map<?, ?>) TileCapture.footprint(npc)).get("tileCount"));
    when(npc.getTransformedComposition()).thenReturn(null);
    when(npc.getComposition()).thenReturn(composition);
    assertEquals(Integer.valueOf(5), TileCapture.tileSize(npc));
    when(npc.getComposition()).thenReturn(null);
    assertNull(TileCapture.footprint(npc));
  }

  @Test
  public void missingCollisionIsNotClaimedWalkable() {
    assertTrue(new TileCapture().capture(mock(WorldView.class)).isEmpty());
    assertFalse(TileCapture.open(0x1000000));
    assertFalse(TileCapture.open(CollisionDataFlag.BLOCK_MOVEMENT_FLOOR));
  }
}
