package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.*;
import net.runelite.api.*;
import org.junit.Test;

public class OverheadsTest {
  @Test
  public void capturesOnlyVisibleHealthAndPlayerHeadIcon() {
    Player p = mock(Player.class);
    when(p.getHealthRatio()).thenReturn(-1);
    when(p.getHealthScale()).thenReturn(-1);
    Overheads o = new Overheads();
    Map<String, Object> unknown = o.capture(p, 0);
    assertEquals(-1, unknown.get("healthRatio"));
    assertNull(unknown.get("overheadIcon"));
    when(p.getOverheadIcon()).thenReturn(HeadIcon.MELEE);
    when(p.getHealthRatio()).thenReturn(7);
    when(p.getHealthScale()).thenReturn(10);
    Map<String, Object> known = o.capture(p, 0);
    assertEquals("MELEE", known.get("overheadIcon"));
    assertEquals(7, known.get("healthRatio"));
  }

  @Test
  public void expiresHitsByClientCycleAndDoesNotAttachToReusedPlayerIndex() {
    Player p = mock(Player.class), replacement = mock(Player.class);
    when(p.getId()).thenReturn(2);
    when(replacement.getId()).thenReturn(2);
    Hitsplat hit = mock(Hitsplat.class);
    when(hit.getAmount()).thenReturn(17);
    when(hit.getDisappearsOnGameCycle()).thenReturn(150);
    Overheads o = new Overheads();
    o.hit(p, hit, 100, 1000);
    List<?> active = (List<?>) o.capture(p, 149).get("hitsplats");
    assertEquals(1, active.size());
    assertEquals(2000L, ((Map<?, ?>) active.get(0)).get("expiresMs"));
    assertTrue(((List<?>) o.capture(replacement, 149).get("hitsplats")).isEmpty());
    assertTrue(((List<?>) o.capture(p, 150).get("hitsplats")).isEmpty());
    assertEquals(1, active.size());
  }

  @Test
  public void keepsAtMostFourActiveSplatsAndDropsAbsentActors() {
    Actor a = mock(NPC.class);
    Hitsplat h = mock(Hitsplat.class);
    when(h.getDisappearsOnGameCycle()).thenReturn(100);
    Overheads o = new Overheads();
    for (int n = 0; n < 6; n++) o.hit(a, h, 0, 0);
    assertEquals(4, ((List<?>) o.capture(a, 0).get("hitsplats")).size());
    o.retain(Set.of());
    assertTrue(((List<?>) o.capture(a, 0).get("hitsplats")).isEmpty());
  }
}
