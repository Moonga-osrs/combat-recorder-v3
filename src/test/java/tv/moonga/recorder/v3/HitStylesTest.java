package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.*;
import net.runelite.api.*;
import org.junit.Test;

public class HitStylesTest {
  @Test
  public void resolvesPersonalAndMaxHitPreferencesAtCaptureTime() {
    Client client = mock(Client.class);
    HitStyles styles = HitStyles.current();
    when(client.getVarbitValue(10236)).thenReturn(0);
    assertEquals(29, styles.resolve(client, 17));
    when(client.getVarbitValue(10236)).thenReturn(1);
    assertEquals(28, styles.resolve(client, 17));
    when(client.getVarbitValue(14196)).thenReturn(0);
    assertEquals(48, styles.resolve(client, 43));
    when(client.getVarbitValue(14196)).thenReturn(1);
    assertEquals(28, styles.resolve(client, 43));
    assertEquals(50, styles.cycles(28));
    assertEquals(9999, styles.resolve(client, 9999));
  }

  @Test
  public void delayedHitsStartAfterTheirActualDisplayDelay() {
    Actor actor = mock(Player.class);
    Hitsplat hit = mock(Hitsplat.class);
    when(hit.getDisappearsOnGameCycle()).thenReturn(200);
    Overheads overheads = new Overheads();
    overheads.hit(actor, hit, 100, 1000, 28, 50);
    Map<?, ?> data = (Map<?, ?>) ((List<?>) overheads.capture(actor, 100).get("hitsplats")).get(0);
    assertEquals(2000L, data.get("startMs"));
    assertEquals(3000L, data.get("expiresMs"));
    assertEquals(28, data.get("style"));
  }
}
