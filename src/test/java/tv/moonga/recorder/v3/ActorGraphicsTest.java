package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.*;
import java.util.concurrent.TimeUnit;
import net.runelite.api.*;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ActorGraphicsTest {
  @Rule public TemporaryFolder temp = new TemporaryFolder();

  @Test
  public void capturesSeparateEffectWithoutApplyingHeightTwice() throws Exception {
    Client client = mock(Client.class);
    when(client.getGameCycle()).thenReturn(100);
    Actor actor = mock(Actor.class);
    ActorSpotAnim effect = mock(ActorSpotAnim.class);
    when(effect.getId()).thenReturn(42);
    when(effect.getFrame()).thenReturn(2);
    when(effect.getStartCycle()).thenReturn(90);
    when(effect.getHeight()).thenReturn(80);
    Model model = mock(Model.class);
    when(model.getVerticesCount()).thenReturn(3);
    when(model.getFaceCount()).thenReturn(1);
    when(model.getVerticesX()).thenReturn(new float[] {0, 16, 0});
    when(model.getVerticesY()).thenReturn(new float[] {-80, -96, -80});
    when(model.getVerticesZ()).thenReturn(new float[] {0, 0, 16});
    when(model.getFaceIndices1()).thenReturn(new int[] {0});
    when(model.getFaceIndices2()).thenReturn(new int[] {1});
    when(model.getFaceIndices3()).thenReturn(new int[] {2});
    when(model.getFaceColors1()).thenReturn(new int[] {100});
    when(model.getFaceColors2()).thenReturn(new int[] {100});
    when(model.getFaceColors3()).thenReturn(new int[] {100});
    when(effect.getModel()).thenReturn(model);
    IterableHashTable<ActorSpotAnim> effects = mock(IterableHashTable.class);
    when(effects.iterator()).thenAnswer(call -> List.of(effect).iterator());
    when(actor.getSpotAnims()).thenReturn(effects);
    Recording recording = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    VisualCapture capture = new VisualCapture(client, recording, () -> 10);
    List<Map<String, Object>> rows = new ArrayList<>();
    Map<String, Object> parent = Map.of("id", "p1", "x", 100, "z", 200, "height", 123);
    capture.captureSpotAnimations(rows, actor, parent);
    assertEquals(1, rows.size());
    assertEquals("actorGfx", rows.get(0).get("kind"));
    assertEquals(123, rows.get(0).get("height"));
    assertEquals(0, rows.get(0).get("orientation"));
    when(effect.getStartCycle()).thenReturn(101);
    capture.captureSpotAnimations(rows, actor, parent);
    assertEquals("Delayed effects must not appear early", 1, rows.size());
    when(effect.getStartCycle()).thenReturn(90);
    when(effect.getModel()).thenReturn(null);
    capture.captureSpotAnimations(rows, actor, parent);
    assertEquals("Unavailable models must not create phantom effects", 1, rows.size());
    capture.finish().get(10, TimeUnit.SECONDS);
  }
}
