package tv.moonga.recorder.v3;

import static tv.moonga.recorder.v3.CombatRecorderPlugin.map;

import java.util.*;
import net.runelite.api.*;

/** Observed overhead state only; unknown health and non-overhead prayers are not inferred. */
final class Overheads {
  private final IdentityHashMap<Actor, List<Map<String, Object>>> hits = new IdentityHashMap<>();

  void hit(Actor actor, Hitsplat hit, int cycle, long ms) {
    hit(actor, hit, cycle, ms, hit == null ? -1 : hit.getHitsplatType(), 0);
  }

  void hit(Actor actor, Hitsplat hit, int cycle, long ms, int style, int displayCycles) {
    if (actor == null || hit == null || hit.getDisappearsOnGameCycle() <= cycle) return;
    List<Map<String, Object>> active = hits.computeIfAbsent(actor, a -> new ArrayList<>());
    active.removeIf(h -> ((Number) h.get("expiresCycle")).intValue() <= cycle);
    active.add(
        map(
            "amount",
            hit.getAmount(),
            "type",
            hit.getHitsplatType(),
            "style",
            style,
            "startMs",
            displayCycles > 0
                ? ms + (hit.getDisappearsOnGameCycle() - cycle - displayCycles) * 20L
                : ms,
            "expiresCycle",
            hit.getDisappearsOnGameCycle(),
            "expiresMs",
            ms + (hit.getDisappearsOnGameCycle() - cycle) * 20L));
    while (active.size() > 4) active.remove(0);
  }

  Map<String, Object> capture(Actor actor, int cycle) {
    List<Map<String, Object>> active = hits.get(actor);
    if (active != null) {
      active.removeIf(h -> ((Number) h.get("expiresCycle")).intValue() <= cycle);
      if (active.isEmpty()) hits.remove(actor);
    }
    HeadIcon icon = actor instanceof Player ? ((Player) actor).getOverheadIcon() : null;
    int ratio = actor.getHealthRatio(), scale = actor.getHealthScale();
    Map<String,Object> result=map(
        "logicalHeight",
        actor.getLogicalHeight(),
        "healthRatio",
        ratio,
        "healthScale",
        scale,
        "overheadIcon",
        icon == null ? null : icon.name(),
        "hitsplats",
        active == null ? List.of() : new ArrayList<>(active));
    result.put("overheadText",actor.getOverheadText());
    result.put("overheadCycles",actor.getOverheadCycle());
    if(actor instanceof Player)result.put("skullIcon",((Player)actor).getSkullIcon());
    if(actor instanceof NPC){
      int[] archives=((NPC)actor).getOverheadArchiveIds();
      short[] sprites=((NPC)actor).getOverheadSpriteIds();
      if(archives!=null)result.put("overheadArchives",archives.clone());
      if(sprites!=null)result.put("overheadSprites",sprites.clone());
    }
    return result;
  }

  void retain(Set<Actor> present) {
    hits.keySet().retainAll(present);
  }
}
