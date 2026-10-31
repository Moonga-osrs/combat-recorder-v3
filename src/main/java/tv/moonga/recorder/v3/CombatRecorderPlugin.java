package tv.moonga.recorder.v3;

import java.awt.*;
import java.awt.image.BufferedImage;
import net.runelite.client.util.Filepath;
import net.runelite.client.util.LinkBrowser;
import com.google.gson.Gson;
import java.util.*;
import java.util.List;
import java.util.concurrent.*;
import javax.inject.Inject;
import javax.swing.*;
import net.runelite.api.*;
import net.runelite.api.coords.*;
import net.runelite.api.events.*;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.ui.*;

@PluginDescriptor(
    name = "Combat Recorder v3",
    description = "Record visible combat events and replay positions locally")
public class CombatRecorderPlugin extends Plugin {
  @Inject private Client client;
  @Inject private net.runelite.client.game.ItemManager itemManager;
  private ItemAssets iconAssets;
  @Inject private ClientThread clientThread;
  @Inject private ClientToolbar toolbar;
  private VisualCapture visual;
  private PlayerState playerState;
  private volatile int captureFps = 50;
  private volatile Recording recording;
  private NavigationButton navigation;
  private JButton recordButton, markerButton;
  private JLabel status;
  private volatile boolean active, busy;
  private int generation;
  private final IdentityHashMap<Actor, Long> actors = new IdentityHashMap<>();
  private final IdentityHashMap<Projectile, Long> projectiles = new IdentityHashMap<>();
  private long nextActor, nextProjectile;
  private Filepath directory;
  @Inject private Gson gson;
  private ExecutorService io;
  private final TileCapture tiles = new TileCapture();
  private final GroundAnimations groundAnimations = new GroundAnimations();
  private final Set<Object> emittedTileRevisions = new HashSet<>();

  static Map<String, Object> map(Object... pairs) {
    Map<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) m.put((String) pairs[i], pairs[i + 1]);
    return m;
  }

  @Override
  protected void startUp() throws Exception {
    active = true;
    busy = false;
    generation++;
    directory = getPluginDirectory().join("recordings");
    io =
        Executors.newSingleThreadExecutor(
            r -> {
              Thread t = new Thread(r, "moonga-recorder-files");
              t.setDaemon(true);
              return t;
            });
    PluginPanel panel = new PluginPanel() {};
    panel.setLayout(new BorderLayout(0, 12));
    JPanel controls = new JPanel(new GridLayout(0, 1, 0, 10));
    controls.add(new JLabel("Moonga Combat Recorder v3"));
    recordButton = new JButton("● Record");
    recordButton.setForeground(new Color(255, 95, 95));
    recordButton.addActionListener(e -> clientThread.invoke(() -> toggle()));
    controls.add(recordButton);
    markerButton = new JButton("Mark this moment");
    markerButton.addActionListener(
        e -> clientThread.invoke(() -> emit("marker", map("label", "Manual marker"))));
    markerButton.setEnabled(false);
    controls.add(markerButton);
    JComboBox<Integer> fps = new JComboBox<>(new Integer[] {5, 10, 15, 25, 50});
    fps.setSelectedItem(50);
    fps.addActionListener(e -> captureFps = (Integer) fps.getSelectedItem());
    controls.add(new JLabel("3D sampling FPS (higher uses more disk and CPU)"));
    controls.add(fps);
    JButton folder = new JButton("Copy recordings path");
    folder.addActionListener(e -> Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new java.awt.datatransfer.StringSelection(directory.toString()), null));
    controls.add(folder);
    JButton replay = new JButton("Replay viewer source / setup");
    replay.addActionListener(e -> LinkBrowser.browse("https://github.com/Moonga-osrs/combat-recorder-v3/tree/main/viewer"));
    controls.add(replay);
    status = new JLabel("<html>Ready. Click Record before the fight.</html>");
    controls.add(status);
    controls.add(
        new JLabel(
            "<html>3D replay only. No screen recording.<br>Local inventory, equipment and"
                + " prayers.<br>Visible ground items. Stops on logout.</html>"));
    panel.add(controls, BorderLayout.NORTH);
    BufferedImage icon = new BufferedImage(24, 24, BufferedImage.TYPE_INT_ARGB);
    Graphics2D g = icon.createGraphics();
    g.setColor(new Color(240, 65, 85));
    g.fillOval(3, 3, 18, 18);
    g.dispose();
    navigation =
        NavigationButton.builder().tooltip("Combat Recorder v3").icon(icon).panel(panel).build();
    toolbar.addNavigation(navigation);
  }

  private void toggle() {
    if (!active || busy) return;
    if (recording != null) {
      stop("manual");
      return;
    }
    if (client.getGameState() != GameState.LOGGED_IN) {
      ui("Log in before recording.");
      return;
    }
    busy = true;
    ui("Preparing recording...");
    final int startedGeneration = generation;
    io.submit(
        () -> {
          try {
            Recording created = new Recording(directory, gson);
            clientThread.invoke(
                () -> {
                  if (!active
                      || generation != startedGeneration
                      || client.getGameState() != GameState.LOGGED_IN) {
                    created.close();
                    busy = false;
                    ui("Start cancelled: not logged in.");
                    return;
                  }
                  actors.clear();
                  projectiles.clear();
                  nextActor = 0;
                  nextProjectile = 0;
                  tiles.clear();
                  emittedTileRevisions.clear();
                  groundAnimations.clear();
                  recording = created;
                  busy = false;
                  emit(
                      "header",
                      map(
                          "schema",
                          3,
                          "meshEncoding", "m3d1-zlib",
                          "gameRevision",
                          client.getRevision(),
                          "started",
                          java.time.Instant.now().toString(),
                          "world",
                          client.getWorld(),
                          "runeliteApi",
                          "1.13.4",
                          "scope",
                          "Client-visible only; snapshots at server ticks; animation/effect changes"
                              + " between ticks are separate events.",
                          "health",
                          "Other actors: healthRatio/healthScale only, -1 means unknown.",
                          "chatRecorded",
                          false,
                          "overheadTextRecorded", true,
                          "visualScope",
                          "3D scene, local player state and visible ground items; no screenshots",
                          "tileSchema",
                          1,
                          "tiles",
                          "Collision maps sampled each server tick; moves for a 1x1 actor ignoring"
                              + " actor collision. Occupancy uses server southwest anchor +"
                              + " footprint size. Not hazard/safe-tile detection."));
                  try {
                    iconAssets = new ItemAssets(itemManager, created);
                    playerState = new PlayerState(client, created, iconAssets);
                    snapshot("baseline");
                    groundBaseline();
                    playerState.sample();
                    visual =
                        new VisualCapture(
                            client, created, () -> captureFps, playerState::groundTiles);
                    ui("Recording started (v3 beta)");
                  } catch (RuntimeException ex) {
                    emit("capture_error", map("error", ex.toString()));
                    stop("baseline_error");
                  }
                });
          } catch (Exception ex) {
            busy = false;
            ui("Could not start: " + ex.getMessage());
          }
        });
  }

  private void stop(String reason) {
    Recording r = recording;
    if (r == null) return;
    emit("stop", map("reason", reason));
    recording = null;
    busy = true;
    ui("Saving recording...");
    playerState = null;
    CompletableFuture<Void> itemWrites =
        iconAssets == null ? CompletableFuture.completedFuture(null) : iconAssets.finish();
    iconAssets = null;
    VisualCapture captured = visual;
    visual = null;
    (captured == null ? itemWrites.thenCompose(unused -> r.close()) : captured.finish(itemWrites))
        .whenComplete(
            (path, ex) -> {
              busy = false;
              ui(
                  ex == null
                      ? "Saved: " + path.getFileName() + " • dropped: " + r.dropped()
                      : "Write error! Incomplete recording: " + ex.getMessage());
            });
    actors.clear();
    projectiles.clear();
    groundAnimations.clear();
  }

  private void ui(String message) {
    SwingUtilities.invokeLater(
        () -> {
          if (status == null) return;
          // Plain text prevents actor/file names from becoming Swing HTML.
          status.setText(message);
          status.setToolTipText(message);
          recordButton.setText(recording == null ? "● Record" : "■ Stop recording");
          recordButton.setEnabled(active && !busy);
          markerButton.setEnabled(recording != null);
        });
  }

  @Override
  protected void shutDown() {
    active = false;
    stop("plugin_shutdown");
    if (navigation != null) toolbar.removeNavigation(navigation);
    if (io != null) io.shutdown();
  }

  private void emit(String type, Object data) {
    Recording r = recording;
    if (r != null) r.add(type, client.getTickCount(), client.getGameCycle(), data);
  }

  private Long key(Actor a) {
    return a == null ? null : actors.computeIfAbsent(a, k -> ++nextActor);
  }

  private Object point(WorldPoint p) {
    return p == null ? null : map("x", p.getX(), "y", p.getY(), "plane", p.getPlane());
  }

  private Object local(LocalPoint p) {
    return p == null
        ? null
        : map("x", p.getX(), "y", p.getY(), "sceneX", p.getSceneX(), "sceneY", p.getSceneY());
  }

  private Map<String, Object> actor(Actor a) {
    WorldView w = a.getWorldView();
    Map<String, Object> m =
        map(
            "key",
            key(a),
            "kind",
            a instanceof NPC ? "npc" : "player",
            "name",
            a.getName(),
            "self",
            a == client.getLocalPlayer(),
            "worldView",
            w == null ? -1 : w.getId(),
            "world",
            point(a.getWorldLocation()),
            "local",
            local(a.getLocalLocation()),
            "animation",
            a.getAnimation(),
            "animationFrame",
            a.getAnimationFrame(),
            "pose",
            a.getPoseAnimation(),
            "orientation",
            a.getOrientation(),
            "currentOrientation",
            a.getCurrentOrientation(),
            "graphic",
            a.getGraphic(),
            "healthRatio",
            a.getHealthRatio(),
            "healthScale",
            a.getHealthScale(),
            "dead",
            a.isDead(),
            "target",
            key(a.getInteracting()),
            "size",
            TileCapture.tileSize(a),
            "sizeUnits",
            "tiles");
    if (w != null && a.getLocalLocation() != null && a.getWorldLocation() != null)
      m.put(
          "template",
          point(
              WorldPoint.fromLocalInstance(
                  client, a.getLocalLocation(), a.getWorldLocation().getPlane())));
    List<Object> spots = new ArrayList<>();
    if (a.getSpotAnims() != null)
      for (ActorSpotAnim s : a.getSpotAnims())
        spots.add(
            map(
                "id",
                s.getId(),
                "frame",
                s.getFrame(),
                "height",
                s.getHeight(),
                "startCycle",
                s.getStartCycle()));
    m.put("spotAnimations", spots);
    m.put("occupiedArea", TileCapture.footprint(a));
    if (a instanceof NPC) {
      NPC n = (NPC) a;
      m.put("id", n.getId());
      m.put("index", n.getIndex());
    }
    if (a instanceof Player) {
      Player p = (Player) a;
      m.put("index", p.getId());
      PlayerComposition c = p.getPlayerComposition();
      if (c != null) {
        m.put("appearanceEquipment", c.getEquipmentIds());
        m.put("appearanceColors", c.getColors());
        m.put("gender", c.getGender());
      }
    }
    return m;
  }

  private List<WorldView> views() {
    List<WorldView> list = new ArrayList<>();
    WorldView top = client.getTopLevelWorldView();
    if (top != null) {
      list.add(top);
      for (WorldView w : top.worldViews()) if (w != null && w != top) list.add(w);
    }
    return list;
  }

  private void snapshot(String type) {
    List<Object> entities = new ArrayList<>(), worlds = new ArrayList<>();
    Set<Actor> present = Collections.newSetFromMap(new IdentityHashMap<>());
    for (WorldView w : views()) {
      List<Object> collisionRefs = new ArrayList<>();
      for (Map<String, Object> collision : tiles.capture(w)) {
        if (emittedTileRevisions.add(collision.get("revision"))) emit("collision", collision);
        collisionRefs.add(
            map("plane", collision.get("plane"), "revision", collision.get("revision")));
      }
      worlds.add(
          map(
              "id",
              w.getId(),
              "baseX",
              w.getBaseX(),
              "baseY",
              w.getBaseY(),
              "plane",
              w.getPlane(),
              "instance",
              w.isInstance(),
              "regions",
              w.getMapRegions(),
              "chunks",
              type.equals("baseline") ? w.getInstanceTemplateChunks() : null,
              "collision",
              collisionRefs));
      for (Player p : w.players())
        if (p != null) {
          entities.add(actor(p));
          present.add(p);
        }
      for (NPC n : w.npcs())
        if (n != null) {
          entities.add(actor(n));
          present.add(n);
        }
    }
    Map<String, Object> skills = new LinkedHashMap<>();
    for (Skill s : Skill.values())
      if (s != Skill.OVERALL)
        skills.put(
            s.name(),
            map(
                "current",
                client.getBoostedSkillLevel(s),
                "base",
                client.getRealSkillLevel(s),
                "xp",
                client.getSkillExperience(s)));
    List<String> prayers = new ArrayList<>();
    for (Prayer p : Prayer.values()) if (client.isPrayerActive(p)) prayers.add(p.name());
    emit(
        type,
        map(
            "actors",
            entities,
            "views",
            worlds,
            "skills",
            skills,
            "prayers",
            prayers,
            "runEnergy",
            client.getEnergy(),
            "inventory",
            container(InventoryID.INVENTORY),
            "equipment",
            container(InventoryID.EQUIPMENT)));
    actors.keySet().retainAll(present);
    projectiles.keySet().removeIf(p -> p.getEndCycle() < client.getGameCycle());
  }

  private Object container(InventoryID id) {
    ItemContainer c = client.getItemContainer(id);
    if (c == null) return null;
    List<Object> list = new ArrayList<>();
    Item[] items = c.getItems();
    for (int i = 0; i < items.length; i++)
      if (items[i] != null && items[i].getId() >= 0)
        list.add(map("slot", i, "id", items[i].getId(), "quantity", items[i].getQuantity()));
    return list;
  }

  private Object ground(Tile tile, TileItem item) {
    if (playerState != null) playerState.ground(tile, item);
    return map(
        "id",
        item.getId(),
        "quantity",
        item.getQuantity(),
        "worldView",
        tile.getLocalLocation().getWorldView(),
        "world",
        point(tile.getWorldLocation()),
        "local",
        local(tile.getLocalLocation()));
  }

  private void groundBaseline() {
    for (WorldView w : views()) {
      Tile[][][] tiles = w.getScene().getTiles();
      if (tiles == null) continue;
      Set<TileObject> seen = Collections.newSetFromMap(new IdentityHashMap<>());
      for (Tile[][] plane : tiles)
        for (Tile[] row : plane)
          for (Tile tile : row) {
            if (tile != null && tile.getGroundItems() != null)
              for (TileItem item : tile.getGroundItems())
                emit("ground_present", map("worldView", w.getId(), "item", ground(tile, item)));
            if (tile != null) {
              for (GameObject o : tile.getGameObjects())
                if (o != null && seen.add(o)) emit("object_present", object(o));
              if (tile.getGroundObject() != null) {
                groundAnimations.add(tile.getGroundObject());
                emit("object_present", object(tile.getGroundObject()));
              }
              if (tile.getWallObject() != null)
                emit("object_present", object(tile.getWallObject()));
              if (tile.getDecorativeObject() != null)
                emit("object_present", object(tile.getDecorativeObject()));
            }
          }
    }
  }

  @Subscribe
  public void onGameTick(GameTick e) {
    if (recording == null) return;
    if (recording.error() != null) {
      stop("write_error");
      return;
    }
    try {
      snapshot("tick");
      ui("● Recording • tick " + client.getTickCount() + " • dropped " + recording.dropped());
    } catch (RuntimeException ex) {
      emit("capture_error", map("error", ex.toString()));
    }
  }

  @Subscribe
  public void onClientTick(ClientTick e) {
    if (recording == null || client.getGameState() != GameState.LOGGED_IN) return;
    try {
      if (playerState != null) playerState.sample();
      if (visual != null) visual.sample();
      groundAnimations.sample(
          (o, state) -> emit("ground_object_animation", map("object", object(o), "state", state)));
    } catch (RuntimeException ex) {
      emit("capture_error", map("source", "ground_animation", "error", ex.toString()));
    }
  }

  @Subscribe
  public void onGameStateChanged(GameStateChanged e) {
    if (recording == null) return;
    emit("game_state", map("state", e.getGameState().name(), "world", client.getWorld()));
    if (e.getGameState() == GameState.LOGIN_SCREEN
        || e.getGameState() == GameState.HOPPING
        || e.getGameState() == GameState.CONNECTION_LOST) stop(e.getGameState().name());
    else if (e.getGameState() == GameState.LOGGED_IN) {
      emit("scene_reset", map());
      if (visual != null) visual.resetScene();
      if (playerState != null) playerState.clearGround();
      tiles.clear();
      groundAnimations.clear();
      try {
        snapshot("baseline");
        groundBaseline();
      } catch (RuntimeException ex) {
        emit("capture_error", map("error", ex.toString()));
      }
    }
  }

  @Subscribe
  public void onAnimationChanged(AnimationChanged e) {
    if (recording != null) emit("animation", actor(e.getActor()));
  }

  @Subscribe
  public void onGraphicChanged(GraphicChanged e) {
    if (recording != null) emit("graphic", actor(e.getActor()));
  }

  @Subscribe
  public void onNpcSpawned(NpcSpawned e) {
    if (recording != null) emit("npc_spawn", actor(e.getNpc()));
  }

  @Subscribe
  public void onNpcDespawned(NpcDespawned e) {
    if (recording != null) {
      emit("npc_despawn", actor(e.getNpc()));
      actors.remove(e.getNpc());
    }
  }

  @Subscribe
  public void onNpcChanged(NpcChanged e) {
    if (recording != null) emit("npc_changed", actor(e.getNpc()));
  }

  @Subscribe
  public void onPlayerSpawned(PlayerSpawned e) {
    if (recording != null) emit("player_spawn", actor(e.getPlayer()));
  }

  @Subscribe
  public void onPlayerDespawned(PlayerDespawned e) {
    if (recording != null) {
      emit("player_despawn", actor(e.getPlayer()));
      actors.remove(e.getPlayer());
    }
  }

  @Subscribe
  public void onActorDeath(ActorDeath e) {
    if (recording != null) emit("death", actor(e.getActor()));
  }

  @Subscribe
  public void onInteractingChanged(InteractingChanged e) {
    if (recording != null)
      emit("target", map("source", key(e.getSource()), "target", key(e.getTarget())));
  }

  @Subscribe
  public void onHitsplatApplied(HitsplatApplied e) {
    if (recording != null && visual != null) visual.hit(e.getActor(), e.getHitsplat());
    if (recording != null)
      emit(
          "hitsplat",
          map(
              "actor",
              actor(e.getActor()),
              "amount",
              e.getHitsplat().getAmount(),
              "type",
              e.getHitsplat().getHitsplatType(),
              "disappearsCycle",
              e.getHitsplat().getDisappearsOnGameCycle()));
  }

  @Subscribe
  public void onItemSpawned(ItemSpawned e) {
    if (recording != null) emit("ground_spawn", ground(e.getTile(), e.getItem()));
  }

  @Subscribe
  public void onItemDespawned(ItemDespawned e) {
    if (recording != null) {
      emit("ground_despawn", ground(e.getTile(), e.getItem()));
      if (playerState != null) playerState.removeGround(e.getItem());
    }
  }

  @Subscribe
  public void onItemQuantityChanged(ItemQuantityChanged e) {
    if (recording != null)
      emit(
          "ground_quantity",
          map(
              "item",
              ground(e.getTile(), e.getItem()),
              "old",
              e.getOldQuantity(),
              "new",
              e.getNewQuantity()));
    if (recording != null && playerState != null)
      playerState.ground(e.getTile(), e.getItem(), e.getNewQuantity());
  }

  @Subscribe
  public void onProjectileMoved(ProjectileMoved e) {
    if (recording == null) return;
    Projectile p = e.getProjectile();
    long id = projectiles.computeIfAbsent(p, k -> ++nextProjectile);
    emit(
        "projectile",
        map(
            "key",
            id,
            "id",
            p.getId(),
            "source",
            key(p.getSourceActor()),
            "target",
            key(p.getTargetActor()),
            "sourcePoint",
            point(p.getSourcePoint()),
            "targetPoint",
            point(p.getTargetPoint()),
            "x",
            p.getX(),
            "y",
            p.getY(),
            "z",
            p.getZ(),
            "startCycle",
            p.getStartCycle(),
            "endCycle",
            p.getEndCycle()));
  }

  @Subscribe
  public void onGraphicsObjectCreated(GraphicsObjectCreated e) {
    if (recording != null) {
      GraphicsObject g = e.getGraphicsObject();
      emit(
          "effect",
          map(
              "id",
              g.getId(),
              "worldView",
              g.getWorldView().getId(),
              "local",
              local(g.getLocation()),
              "plane",
              g.getLevel(),
              "startCycle",
              g.getStartCycle()));
    }
  }

  @Subscribe
  public void onMenuOptionClicked(MenuOptionClicked e) {
    if (recording != null)
      emit(
          "action",
          map(
              "option",
              e.getMenuOption(),
              "target",
              e.getMenuTarget(),
              "action",
              e.getMenuAction().name(),
              "id",
              e.getId(),
              "itemId",
              e.getItemId(),
              "param0",
              e.getParam0(),
              "param1",
              e.getParam1()));
  }

  @Subscribe
  public void onStatChanged(StatChanged e) {
    if (recording != null)
      emit(
          "stat",
          map(
              "skill",
              e.getSkill().name(),
              "current",
              e.getBoostedLevel(),
              "base",
              e.getLevel(),
              "xp",
              e.getXp()));
  }

  private Object object(TileObject o) {
    return map(
        "id",
        o.getId(),
        "kind",
        o instanceof GroundObject
            ? "GroundObject"
            : o.getClass().getInterfaces().length > 0
                ? o.getClass().getInterfaces()[0].getSimpleName()
                : "object",
        "worldView",
        o.getWorldView().getId(),
        "world",
        point(o.getWorldLocation()),
        "local",
        local(o.getLocalLocation()),
        "groundAnimation",
        o instanceof GroundObject ? GroundAnimations.read((GroundObject) o) : null);
  }

  @Subscribe
  public void onGameObjectSpawned(GameObjectSpawned e) {
    if (recording != null && visual != null) visual.objectChanged(e.getGameObject(), true);
    if (recording != null) emit("object_spawn", object(e.getGameObject()));
  }

  @Subscribe
  public void onGameObjectDespawned(GameObjectDespawned e) {
    if (recording != null && visual != null) visual.objectChanged(e.getGameObject(), false);
    if (recording != null) emit("object_despawn", object(e.getGameObject()));
  }

  @Subscribe
  public void onGroundObjectSpawned(GroundObjectSpawned e) {
    if (recording != null && visual != null) visual.objectChanged(e.getGroundObject(), true);
    if (recording != null) {
      groundAnimations.add(e.getGroundObject());
      emit("ground_object_spawn", object(e.getGroundObject()));
    }
  }

  @Subscribe
  public void onGroundObjectDespawned(GroundObjectDespawned e) {
    if (recording != null && visual != null) visual.objectChanged(e.getGroundObject(), false);
    if (recording != null) {
      groundAnimations.remove(e.getGroundObject());
      emit("ground_object_despawn", object(e.getGroundObject()));
    }
  }

  @Subscribe
  public void onWallObjectSpawned(WallObjectSpawned e) {
    if (recording != null && visual != null) visual.objectChanged(e.getWallObject(), true);
  }

  @Subscribe
  public void onWallObjectDespawned(WallObjectDespawned e) {
    if (recording != null && visual != null) visual.objectChanged(e.getWallObject(), false);
  }

  @Subscribe
  public void onDecorativeObjectSpawned(DecorativeObjectSpawned e) {
    if (recording != null && visual != null) visual.objectChanged(e.getDecorativeObject(), true);
  }

  @Subscribe
  public void onDecorativeObjectDespawned(DecorativeObjectDespawned e) {
    if (recording != null && visual != null) visual.objectChanged(e.getDecorativeObject(), false);
  }
}

