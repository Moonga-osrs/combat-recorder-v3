package tv.moonga.recorder.v3;

import static tv.moonga.recorder.v3.CombatRecorderPlugin.map;

import java.util.*;
import net.runelite.api.*;
import net.runelite.api.coords.LocalPoint;

/** Full seekable snapshots; never reads another player's private inventory or prayers. */
final class PlayerState {
  private final Client client;
  private ItemAssets icons;

  PlayerState(Client client, Recording recording, ItemAssets icons) {
    this(client, recording);
    this.icons = icons;
  }

  private final Recording recording;
  private final Map<Integer, Boolean> stackable = new HashMap<>();

  private boolean stackable(int id) {
    return stackable.computeIfAbsent(
        id,
        key -> {
          ItemComposition def = client.getItemDefinition(key);
          return def != null && def.isStackable();
        });
  }

  private final Map<Integer, String> names = new HashMap<>();
  private final IdentityHashMap<TileItem, Map<String, Object>> ground = new IdentityHashMap<>();
  private final IdentityHashMap<TileItem, Tile> groundTiles = new IdentityHashMap<>();

  List<Tile> groundTiles() {
    Set<Tile> unique = Collections.newSetFromMap(new IdentityHashMap<>());
    unique.addAll(groundTiles.values());
    return new ArrayList<>(unique);
  }

  private Map<String, Object> previous;
  private long lastCheckpoint;
  private long nextGround;

  PlayerState(Client client, Recording recording) {
    this.client = client;
    this.recording = recording;
  }

  private String name(int id) {
    return names.computeIfAbsent(
        id,
        key -> {
          ItemComposition def = client.getItemDefinition(key);
          return def == null ? "Item " + key : def.getName();
        });
  }

  private List<Object> container(InventoryID id) {
    ItemContainer c = client.getItemContainer(id);
    if (c == null) return null;
    List<Object> items = new ArrayList<>();
    Item[] slots = c.getItems();
    for (int i = 0; i < slots.length; i++)
      if (slots[i] != null && slots[i].getId() >= 0)
        items.add(
            map(
                "slot",
                i,
                "id",
                slots[i].getId(),
                "name",
                name(slots[i].getId()),
                "quantity",
                slots[i].getQuantity(),
                "stackable",
                stackable(slots[i].getId()),
                "icon",
                icons == null ? null : icons.require(slots[i].getId(), slots[i].getQuantity())));
    return items;
  }

  void ground(Tile tile, TileItem item) {
    ground(tile, item, item.getQuantity());
  }

  void ground(Tile tile, TileItem item, int quantity) {
    groundTiles.put(item, tile);
    LocalPoint p = tile.getLocalLocation();
    if (p == null) return;
    Map<String, Object> old = ground.get(item);
    long key = old == null ? ++nextGround : ((Number) old.get("key")).longValue();
    WorldView w = client.getWorldView(p.getWorldView());
    ground.put(
        item,
        map(
            "key",
            key,
            "id",
            item.getId(),
            "name",
            name(item.getId()),
            "quantity",
            quantity,
            "icon",
            icons == null ? null : icons.require(item.getId(), quantity),
            "x",
            p.getX(),
            "z",
            p.getY(),
            "height",
            w == null
                ? 0
                : Perspective.getTileHeight(client, p, tile.getPlane())
                    - (tile.getItemLayer() == null ? 0 : tile.getItemLayer().getHeight()),
            "worldView",
            p.getWorldView(),
            "plane",
            tile.getPlane()));
  }

  void removeGround(TileItem item) {
    ground.remove(item);
    groundTiles.remove(item);
  }

  void clearGround() {
    ground.clear();
    groundTiles.clear();
  }

  Map<String, Object> snapshot() {
    List<String> prayers = new ArrayList<>();
    for (Prayer p : Prayer.values()) if (client.isPrayerActive(p)) prayers.add(p.name());
    List<Map<String, Object>> items = new ArrayList<>(ground.values());
    items.sort(Comparator.comparingLong(m -> ((Number) m.get("key")).longValue()));
    Map<String, Object> skills = new LinkedHashMap<>();
    for (Skill s : Skill.values())
      if (s != Skill.OVERALL)
        skills.put(
            s.name(),
            map("current", client.getBoostedSkillLevel(s), "base", client.getRealSkillLevel(s)));
    Player self = client.getLocalPlayer();
    return map(
        "inventory",
        container(InventoryID.INVENTORY),
        "equipment",
        container(InventoryID.EQUIPMENT),
        "prayers",
        prayers,
        "skills",
        skills,
        "runEnergy",
        client.getEnergy(),
        "groundItems",
        items,
        "player",
        self == null ? null : self.getName(),
        "scope",
        "Local player's inventory, equipment and prayers; client-visible ground items only");
  }

  void sample() {
    Map<String, Object> state = snapshot();
    long ms = recording.elapsed();
    if (!state.equals(previous) || ms - lastCheckpoint >= 1000) {
      if (recording.addAt(
          "player_state", client.getTickCount(), client.getGameCycle(), ms, state)) {
        previous = state;
        lastCheckpoint = ms;
      }
    }
  }
}
