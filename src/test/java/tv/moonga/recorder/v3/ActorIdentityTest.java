package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.lang.reflect.*;
import java.util.*;
import net.runelite.api.*;
import org.junit.Test;

public class ActorIdentityTest {
  @Test
  public void reusedNpcSlotGetsNewIdentityAndTargetIsLinked() throws Exception {
    CombatRecorderPlugin p = new CombatRecorderPlugin();
    Field client = CombatRecorderPlugin.class.getDeclaredField("client");
    client.setAccessible(true);
    client.set(p, mock(Client.class));
    Method capture = CombatRecorderPlugin.class.getDeclaredMethod("actor", Actor.class);
    capture.setAccessible(true);
    NPC a = mock(NPC.class), b = mock(NPC.class);
    when(a.getIndex()).thenReturn(8);
    when(b.getIndex()).thenReturn(8);
    when(a.getInteracting()).thenReturn(b);
    Map<?, ?> first = (Map<?, ?>) capture.invoke(p, a),
        again = (Map<?, ?>) capture.invoke(p, a),
        other = (Map<?, ?>) capture.invoke(p, b);
    assertEquals(first.get("key"), again.get("key"));
    assertNotEquals(first.get("key"), other.get("key"));
    assertEquals(first.get("target"), other.get("key"));
  }
}
