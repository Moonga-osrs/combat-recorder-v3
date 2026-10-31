package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.Map;
import net.runelite.api.*;
import org.junit.Test;

public class TerrainGeometryTest {
  @Test
  public void paintUsesClientDiagonalAndMatchingCornerColoursOnUnevenGround() {
    WorldView w = mock(WorldView.class);
    Tile t = mock(Tile.class);
    SceneTilePaint p = mock(SceneTilePaint.class);
    when(t.getSceneTilePaint()).thenReturn(p);
    int[][][] heights = new int[1][2][2];
    heights[0][0][0] = 0;
    heights[0][1][0] = -80;
    heights[0][1][1] = 0;
    heights[0][0][1] = -160;
    when(w.getTileHeights()).thenReturn(heights);
    when(p.getSwColor()).thenReturn(10);
    when(p.getSeColor()).thenReturn(20);
    when(p.getNeColor()).thenReturn(30);
    when(p.getNwColor()).thenReturn(40);
    Map<String, Object> mesh = TerrainGeometry.paint(w, t, 0, 0);
    assertArrayEquals(new int[] {2, 0}, (int[]) mesh.get("a"));
    assertArrayEquals(new int[] {3, 1}, (int[]) mesh.get("b"));
    assertArrayEquals(new int[] {1, 3}, (int[]) mesh.get("c"));
    assertArrayEquals(new int[] {0, -80, 0, -160}, (int[]) mesh.get("y"));
    assertArrayEquals(new int[] {30, 10}, (int[]) mesh.get("ca"));
    assertArrayEquals(new int[] {40, 20}, (int[]) mesh.get("cb"));
    assertArrayEquals(new int[] {20, 40}, (int[]) mesh.get("cc"));
  }
}
