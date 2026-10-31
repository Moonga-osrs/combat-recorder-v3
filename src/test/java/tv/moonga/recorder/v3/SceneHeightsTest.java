package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import net.runelite.api.*;
import net.runelite.api.coords.*;
import org.junit.Test;

public class SceneHeightsTest {
  @Test
  public void actorUsesBridgeHeightInsteadOfLogicalPlaneHeight() {
    Client c = mock(Client.class);
    WorldView w = mock(WorldView.class);
    Player p = mock(Player.class);
    when(p.getWorldView()).thenReturn(w);
    when(p.getLocalLocation()).thenReturn(new LocalPoint(192, 192));
    when(p.getWorldLocation()).thenReturn(new WorldPoint(3201, 3201, 0));
    when(c.getWorldView(anyInt())).thenReturn(w);
    byte[][][] flags = new byte[4][4][4];
    flags[1][1][1] = 2;
    when(w.getTileSettings()).thenReturn(flags);
    when(w.getTileHeight(192, 192, 0)).thenReturn(0);
    when(w.getTileHeight(192, 192, 1)).thenReturn(-240);
    assertEquals(-240, SceneHeights.actor(c, p));
    flags[1][1][1] = 0;
    assertEquals(0, SceneHeights.actor(c, p));
  }

  @Test
  public void terrainUsesTilesRenderLevelRatherThanWorldViewPlane() {
    WorldView w = mock(WorldView.class);
    Tile tile = mock(Tile.class);
    int[][][] heights = new int[4][3][3];
    heights[2][0][0] = -200;
    heights[2][1][0] = -210;
    heights[2][1][1] = -230;
    heights[2][0][1] = -220;
    when(w.getTileHeights()).thenReturn(heights);
    when(tile.getRenderLevel()).thenReturn(2);
    assertArrayEquals(new int[] {-200, -210, -230, -220}, SceneHeights.corners(w, tile, 0, 0));
  }
}
