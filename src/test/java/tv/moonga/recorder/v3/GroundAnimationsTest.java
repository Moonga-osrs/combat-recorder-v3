package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.*;
import net.runelite.api.*;
import org.junit.Test;

public class GroundAnimationsTest {
  @Test
  public void tracksAnimationFrameTransformAndStopWithoutRespawn() {
    GroundObject object = mock(GroundObject.class);
    DynamicObject dynamic = mock(DynamicObject.class);
    Animation animation = mock(Animation.class);
    when(animation.getId()).thenReturn(123);
    when(object.getRenderable()).thenReturn(dynamic);
    when(dynamic.getAnimation()).thenReturn(animation);
    GroundAnimations tracker = new GroundAnimations();
    tracker.add(object);
    List<Map<String, Object>> changes = new ArrayList<>();
    tracker.sample((o, s) -> changes.add(s));
    assertTrue(changes.isEmpty());
    when(dynamic.getAnimFrame()).thenReturn(4);
    tracker.sample((o, s) -> changes.add(s));
    assertEquals(4, changes.get(0).get("frame"));
    assertEquals(123, changes.get(0).get("animationId"));
    ObjectComposition composition = mock(ObjectComposition.class);
    when(composition.getId()).thenReturn(62686);
    when(dynamic.getRecordedObjectComposition()).thenReturn(composition);
    tracker.sample((o, s) -> changes.add(s));
    assertEquals(62686, changes.get(1).get("renderedObjectId"));
    when(dynamic.getAnimation()).thenReturn(null);
    tracker.sample((o, s) -> changes.add(s));
    assertEquals(-1, changes.get(2).get("animationId"));
    tracker.sample((o, s) -> changes.add(s));
    assertEquals(3, changes.size());
    tracker.remove(object);
    when(dynamic.getAnimFrame()).thenReturn(5);
    tracker.sample((o, s) -> changes.add(s));
    assertEquals(3, changes.size());
  }

  @Test
  public void handlesMissingStaticAndReplacedRenderable() {
    GroundObject object = mock(GroundObject.class);
    assertEquals(false, GroundAnimations.read(object).get("available"));
    when(object.getRenderable()).thenReturn(mock(Renderable.class));
    assertEquals(false, GroundAnimations.read(object).get("dynamic"));
    GroundAnimations tracker = new GroundAnimations();
    tracker.add(object);
    when(object.getRenderable()).thenReturn(mock(DynamicObject.class));
    List<Map<String, Object>> changes = new ArrayList<>();
    tracker.sample((o, s) -> changes.add(s));
    assertEquals(1, changes.size());
    tracker.clear();
    when(object.getRenderable()).thenReturn(null);
    tracker.sample((o, s) -> changes.add(s));
    assertEquals(1, changes.size());
  }
}
