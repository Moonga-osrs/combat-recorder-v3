package tv.moonga.recorder.v3;

import static tv.moonga.recorder.v3.CombatRecorderPlugin.map;

import java.util.*;
import java.util.function.BiConsumer;
import net.runelite.api.*;

/** Sample only tracked ground objects; never force model rendering to advance animation. */
final class GroundAnimations {
  private final Map<GroundObject, Map<String, Object>> states = new IdentityHashMap<>();

  void add(GroundObject object) {
    states.put(object, read(object));
  }

  void remove(GroundObject object) {
    states.remove(object);
  }

  void clear() {
    states.clear();
  }

  static Map<String, Object> read(GroundObject object) {
    Renderable renderable = object.getRenderable();
    if (!(renderable instanceof DynamicObject))
      return map("dynamic", false, "available", renderable != null);
    DynamicObject dynamic = (DynamicObject) renderable;
    Animation animation = dynamic.getAnimation();
    ObjectComposition composition = dynamic.getRecordedObjectComposition();
    return map(
        "dynamic",
        true,
        "available",
        true,
        "animationId",
        animation == null ? -1 : animation.getId(),
        "frame",
        dynamic.getAnimFrame(),
        "animationCycle",
        dynamic.getAnimCycle(),
        "renderedObjectId",
        composition == null ? null : composition.getId());
  }

  void sample(BiConsumer<GroundObject, Map<String, Object>> changed) {
    for (Map.Entry<GroundObject, Map<String, Object>> entry : states.entrySet()) {
      Map<String, Object> current = read(entry.getKey());
      if (!current.equals(entry.getValue())) {
        entry.setValue(current);
        changed.accept(entry.getKey(), current);
      }
    }
  }
}
