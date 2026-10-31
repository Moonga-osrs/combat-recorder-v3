package tv.moonga.recorder.v3;

import static tv.moonga.recorder.v3.CombatRecorderPlugin.map;

import java.nio.charset.StandardCharsets;
import net.runelite.client.util.Filepath;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.IntSupplier;
import net.runelite.api.*;
import net.runelite.api.coords.LocalPoint;

/** Copies 3D data on its owning thread; mesh hashing runs off the game thread. */
final class VisualCapture {
  private final Client client;
  private final TextureCapture textures;
  private java.util.function.Supplier<List<Tile>> groundTiles = List::of;

  VisualCapture(
      Client client,
      Recording recording,
      IntSupplier fps,
      java.util.function.Supplier<List<Tile>> groundTiles) {
    this(client, recording, fps);
    this.groundTiles = groundTiles;
  }

  private final Overheads overheads = new Overheads();
  private final IdentityHashMap<Actor,Long> actorKeys=new IdentityHashMap<>();
  private long nextActor;
  private final IdentityHashMap<TileObject, Long> objectKeys = new IdentityHashMap<>();
  private final IdentityHashMap<TileObject, Integer> pendingObjects = new IdentityHashMap<>();
  private final IdentityHashMap<TileObject,List<AnimatedPart>> animatedObjects=new IdentityHashMap<>();
  private final IdentityHashMap<Renderable,Long> effectKeys=new IdentityHashMap<>();
  private long nextEffect;
  private static final class AnimatedPart {
    final Renderable renderable;final int orientation,dx,dz;
    AnimatedPart(Renderable renderable,int orientation,int dx,int dz){this.renderable=renderable;this.orientation=orientation;this.dx=dx;this.dz=dz;}
  }
  private long nextObject;
  private final Recording recording;
  private final IntSupplier fps;
  private final ThreadPoolExecutor encoder =
      new ThreadPoolExecutor(
          1,
          1,
          0,
          TimeUnit.SECONDS,
          new ArrayBlockingQueue<>(4),
          r -> {
            Thread t = new Thread(r, "moonga-v3-encoder");
            t.setDaemon(true);
            return t;
          });
  private final Set<String> assets = Collections.newSetFromMap(new LinkedHashMap<String,Boolean>() {
    @Override protected boolean removeEldestEntry(Map.Entry<String,Boolean> entry){return size()>100000;}
  });
  private final AtomicLong skipped = new AtomicLong();
  private boolean running = true;
  private long nextFrame, nextScene;
  private SceneBatch sceneBatch;
  private Object pendingScene;

  VisualCapture(Client client, Recording recording, IntSupplier fps) {
    this.client = client;
    this.textures = new TextureCapture(client, recording);
    this.recording = recording;
    this.fps = fps;
    recording.add(
        "visual_header",
        client.getTickCount(),
        client.getGameCycle(),
        map(
            "version",
            1,
            "screenshots",
            false,
            "scope",
            "3D scene and structured player state only",
            "meshScope",
            "Top-level scene, bridge render levels, ground piles and texture resources",
            "limitations",
            "3D beta: nested world views are not yet reconstructed",
            "fileSizeLimit",
            null,
            "units",
            "RuneLite local units; 128 units per tile"));
  }

  void sample() {
    long now = System.nanoTime();
    if (!running) return;
    if (encoder.getQueue().remainingCapacity() > 0) textures.drain(this::submit);
    WorldView current = client.getTopLevelWorldView();
    int retries = 0;
    for (TileObject o : new ArrayList<>(pendingObjects.keySet())) {
      if (retries++ >= 2) break;
      int remaining = pendingObjects.get(o);
      pendingObjects.remove(o);
      if (remaining > 0 && !captureObject(o, true)) pendingObjects.put(o, remaining - 1);
    }
    try {
      if (current != null && encoder.getQueue().remainingCapacity() > 0) {
        if (sceneBatch != null && !sceneBatch.matches(current)) {
          sceneBatch = null;
          pendingScene = null;
          nextScene = 0;
        }
        if (sceneBatch == null && pendingScene == null && now >= nextScene)
          sceneBatch = new SceneBatch(current);
        if (sceneBatch != null && sceneBatch.advance()) {
          pendingScene = sceneBatch.result();
          sceneBatch = null;
          nextScene = now + 2_000_000_000L;
        }
      }
    } catch (RuntimeException e) {
      sceneBatch = null;
      nextScene = now + 2_000_000_000L;
      recording.add(
          "visual_error",
          client.getTickCount(),
          client.getGameCycle(),
          map("source", "scene", "error", e.toString()));
    }
    // At 50 Hz capture every client cycle; a wall-clock gate drops cycles due to scheduler jitter.
    if (fps.getAsInt()<50 && now < nextFrame) return;
    nextFrame = now + 1_000_000_000L / Math.max(1, fps.getAsInt());
    int tick = client.getTickCount(), cycle = client.getGameCycle();
    long ms = recording.elapsed();
    if (encoder.getQueue().remainingCapacity() == 0) {
      skipped.incrementAndGet();
      return;
    }
    try {
      WorldView w = client.getTopLevelWorldView();
      if (w == null) return;
      List<Map<String, Object>> actors = new ArrayList<>();
      Set<Actor> present = Collections.newSetFromMap(new IdentityHashMap<>());
      for (Player p : w.players()) if (p != null) present.add(p);
      for (NPC n : w.npcs()) if (n != null) present.add(n);
      overheads.retain(present);
      actorKeys.keySet().retainAll(present);
      for (Player p : w.players()) if (p != null) addActor(actors, p, w);
      for (NPC n : w.npcs()) if (n != null) addActor(actors, n, w);
      Set<Renderable> effects=Collections.newSetFromMap(new IdentityHashMap<>());
      if (w.getGraphicsObjects() != null)
        for (GraphicsObject effect : w.getGraphicsObjects()) {
          LocalPoint p = effect.getLocation();
          if (p != null && groundEffectVisible(effect, w.getPlane(), cycle))
            actors.add(
                map(
                    "id","gfx:"+effectKeys.computeIfAbsent(effect,e->++nextEffect),
                    "kind","groundGfx","gfxId",effect.getId(),"frame",effect.getAnimationFrame(),
                    "startCycle",effect.getStartCycle(),
                    "meshData",
                    captureMesh(effect.getModel()),
                    "x",
                    p.getX(),
                    "z",
                    p.getY(),
                    "height",
                    effect.getZ()));
          effects.add(effect);
        }
      if (client.getProjectiles() != null)
        for (Projectile p : client.getProjectiles()) {
          if (p.getStartCycle() <= cycle
              && p.getEndCycle() >= cycle
              && p.getSourceLevel() == w.getPlane())
            actors.add(
                map(
                    "id","projectile:"+effectKeys.computeIfAbsent(p,e->++nextEffect),
                    "kind","projectile","projectileId",p.getId(),"orientation",p.getOrientation(),
                    "meshData",
                    captureMesh(p.getModel()),
                    "x",
                    p.getX(),
                    "z",
                    p.getY(),
                    "height",
                    p.getZ()));
          effects.add(p);
        }
      effectKeys.keySet().retainAll(effects);
      for(Map.Entry<TileObject,List<AnimatedPart>> entry:animatedObjects.entrySet()){
        TileObject object=entry.getKey();if(object.getWorldView()!=w||object.getWorldLocation().getPlane()!=w.getPlane())continue;
        int index=0;for(AnimatedPart part:entry.getValue()){
          Map<String,Object> geometry=captureMesh(part.renderable.getModel());
          if(geometry!=null)actors.add(map("id","object:"+objectKey(object)+":"+index,"kind","worldObject","meshData",geometry,"x",object.getX()+part.dx,"z",object.getY()+part.dz,"height",object.getZ(),"orientation",part.orientation));
          index++;
        }
      }
      List<String> groundModelTiles = new ArrayList<>();
      for (Tile tile : groundTiles.get()) {
        if (tile.getPlane() != w.getPlane() || tile.getLocalLocation().getWorldView() != w.getId())
          continue;
        ItemLayer pile = tile.getItemLayer();
        if (pile == null) continue;
        int before = actors.size();
        for (Renderable r : new Renderable[] {pile.getBottom(), pile.getMiddle(), pile.getTop()}) {
          if (r == null) continue;
          Map<String, Object> geometry = captureMesh(r instanceof Model ? (Model) r : r.getModel());
          if (geometry != null)
            actors.add(
                map(
                    "kind",
                    "groundItem",
                    "meshData",
                    geometry,
                    "x",
                    pile.getX(),
                    "z",
                    pile.getY(),
                    "height",
                    pile.getZ() - pile.getHeight()));
        }
        if (actors.size() > before)
          groundModelTiles.add(
              tile.getLocalLocation().getSceneX() + "," + tile.getLocalLocation().getSceneY());
      }
      Object capturedScene = pendingScene;
      pendingScene = null;
      Map<String, Object> frame =
          map(
              "actors",
              actors,
              "revision",
              client.getRevision(),
              "instanced",
              w.isInstance(),
              "captureWidth",
              w.getSizeX(),
              "captureHeight",
              w.getSizeY(),
              "groundModelTiles",
              groundModelTiles,
              "worldView",
              w.getId(),
              "baseX",
              w.getBaseX(),
              "baseY",
              w.getBaseY(),
              "plane",
              w.getPlane(),
              "camera",
              new int[] {
                client.getCameraX(),
                client.getCameraY(),
                client.getCameraZ(),
                client.getCameraYaw(),
                client.getCameraPitch()
              });
      submit(
          () -> {
            if (capturedScene != null) {
              Map<String,Object> scene=(Map<String,Object>)capturedScene;
              List<Map<String,Object>> ground=(List<Map<String,Object>>)scene.get("ground");
              if(!ground.isEmpty())scene.put("ground",List.of(map("mesh",recordMesh(GeometryCodec.mergeTerrain(ground),tick,cycle,ms))));
              for(Map<String,Object> part:(List<Map<String,Object>>)scene.get("objects"))encodePart(part,tick,cycle,ms);
              recording.addAt("scene3d",tick,cycle,ms,scene);
            }
            for (Map<String, Object> a : actors) {
              Object mesh = a.remove("meshData");
              if (mesh != null) {
                a.put("mesh",recordMesh((Map<String,Object>)mesh,tick,cycle,ms));
              }
            }
            recording.addAt("frame3d", tick, cycle, ms, frame);
          });
    } catch (RuntimeException e) {
      recording.addAt("visual_error", tick, cycle, ms, map("error", e.toString()));
    }
  }

  private void addActor(List<Map<String, Object>> list, Actor a, WorldView w) {
    LocalPoint p = a.getLocalLocation();
    if (p == null) return;
    Map<String, Object> mesh = captureMesh(a.getModel());
    Map<String, Object> row =
        map(
            "id",
            (a instanceof Player ? "p" : "n")
                + (a instanceof Player ? ((Player) a).getId() : ((NPC) a).getIndex())
                + ":" + actorKeys.computeIfAbsent(a,key->++nextActor),
            "name",
            a.getName(),
            "self",
            a == client.getLocalPlayer(),
            "x",
            p.getX(),
            "z",
            p.getY(),
            "height",
            SceneHeights.actor(client, a),
            "orientation",
            a.getCurrentOrientation(),
            "meshData",
            mesh);
    row.put("animation",a.getAnimation());
    row.put("animationFrame",a.getAnimationFrame());
    row.put("poseAnimation",a.getPoseAnimation());
    row.put("poseFrame",a.getPoseAnimationFrame());
    row.putAll(overheads.capture(a, client.getGameCycle()));
    if (a instanceof NPC) row.put("npcId", ((NPC) a).getId());
    if (a instanceof Player) {
      PlayerComposition c = ((Player) a).getPlayerComposition();
      if (c != null) {
        row.put("equipment", c.getEquipmentIds().clone());
        row.put("colors", c.getColors().clone());
      }
    }
    list.add(row);
    captureSpotAnimations(list, a, row);
  }

  void captureSpotAnimations(
      List<Map<String, Object>> list, Actor actor, Map<String, Object> parent) {
    if (actor.getSpotAnims() == null) return;
    int slot = 0;
    for (ActorSpotAnim effect : actor.getSpotAnims()) {
      int index = slot++;
      if (effect == null || effect.getStartCycle() > client.getGameCycle() || effect.getFrame() < 0)
        continue;
      // ActorSpotAnim.getModel() already applies the effect height and actor transforms.
      Map<String, Object> geometry = captureMesh(effect.getModel());
      if (geometry == null) continue;
      list.add(
          map(
              "id",
              parent.get("id")
                  + ":gfx:"
                  + index
                  + ":"
                  + effect.getId()
                  + ":"
                  + effect.getStartCycle(),
              "kind",
              "actorGfx",
              "gfxId",
              effect.getId(),
              "frame",
              effect.getFrame(),
              "x",
              parent.get("x"),
              "z",
              parent.get("z"),
              "height",
              parent.get("height"),
              "orientation",
              0,
              "meshData",
              geometry));
    }
  }

  static Map<String, Object> mesh(Model m) {
    if (m == null) return null;
    int n = m.getVerticesCount(), f = m.getFaceCount();
    Map<String, Object> result =
        map(
            "x",
            Arrays.copyOf(m.getVerticesX(), n),
            "y",
            Arrays.copyOf(m.getVerticesY(), n),
            "z",
            Arrays.copyOf(m.getVerticesZ(), n),
            "a",
            Arrays.copyOf(m.getFaceIndices1(), f),
            "b",
            Arrays.copyOf(m.getFaceIndices2(), f),
            "c",
            Arrays.copyOf(m.getFaceIndices3(), f),
            "ca",
            Arrays.copyOf(m.getFaceColors1(), f),
            "cb",
            Arrays.copyOf(m.getFaceColors2(), f),
            "cc",
            Arrays.copyOf(m.getFaceColors3(), f),
            "alpha",
            m.getFaceTransparencies() == null ? null : Arrays.copyOf(m.getFaceTransparencies(), f));
    if(m.getFaceRenderPriorities()!=null)result.put("priorities",m.getFaceRenderPriorities().clone());
    if (m.getFaceTextures() != null) result.put("textures", Arrays.copyOf(m.getFaceTextures(), f));
    if (m.getTextureFaces() != null)
      result.put("textureFaces", Arrays.copyOf(m.getTextureFaces(), f));
    if (m.getTexIndices1() != null) result.put("texA", m.getTexIndices1().clone());
    if (m.getTexIndices2() != null) result.put("texB", m.getTexIndices2().clone());
    if (m.getTexIndices3() != null) result.put("texC", m.getTexIndices3().clone());
    result.put(
        "override",
        new int[] {
          m.getOverrideHue(),
          m.getOverrideSaturation(),
          m.getOverrideLuminance(),
          m.getOverrideAmount() & 255
        });
    return result;
  }

  private Map<String, Object> captureMesh(Model model) {
    Map<String, Object> geometry = mesh(model);
    if (model != null) textures.require(model.getFaceTextures());
    return geometry;
  }

  /** Build the scene incrementally to avoid a whole-scene pause on the game thread. */
  final class SceneBatch {
    final WorldView w;
    final int plane, baseX, baseY;
    final long startedMs = recording.elapsed();
    final Tile[][][] tiles;
    final int[][] heights;
    final List<Object> ground = new ArrayList<>(), objects = new ArrayList<>();
    final Set<Tile> seenTiles = Collections.newSetFromMap(new IdentityHashMap<>());
    final Set<TileObject> seen = Collections.newSetFromMap(new IdentityHashMap<>());
    int level, x, z;

    SceneBatch(WorldView w) {
      this.w = w;
      plane = w.getPlane();
      baseX = w.getBaseX();
      baseY = w.getBaseY();
      tiles = w.getScene().getTiles();
      heights = w.getTileHeights()[plane];
    }

    boolean matches(WorldView v) {
      return v == w && v.getPlane() == plane && v.getBaseX() == baseX && v.getBaseY() == baseY;
    }

    boolean advance() {
      long deadline = System.nanoTime() + 2_000_000L;
      while (level <= plane && level < tiles.length) {
        Tile[][] floor = tiles[level];
        if (x >= floor.length) {level++; x = 0; z = 0; continue;}
        if (z >= floor[x].length) {
          x++;
          z = 0;
          continue;
        }
        tile(floor[x][z], x, z);
        z++;
        if (System.nanoTime() >= deadline) return false;
      }
      return true;
    }

    Object result() {
      return map(
          "ground",
          ground,
          "objects",
          objects,
          "baseX",
          baseX,
          "baseY",
          baseY,
          "plane",
          plane,
          "startedMs",
          startedMs,
          "width",
          tiles.length == 0 ? 0 : tiles[0].length,
          "height",
          tiles.length == 0 || tiles[0].length == 0 ? 0 : tiles[0][0].length,
          "capturedPlanes",
          java.util.stream.IntStream.rangeClosed(0, Math.min(plane, tiles.length - 1)).toArray(),
          "instanced",
          w.isInstance());
    }

    void tile(Tile t, int x, int z) {
      if (t == null || !seenTiles.add(t)) return;
      if (t.getBridge() != null) tile(t.getBridge(), x, z);
      SceneTileModel tm = t.getSceneTileModel();
      if (tm != null) {
        textures.require(tm.getTriangleTextureId());
        ground.add(
            map(
                "x",
                tm.getVertexX().clone(),
                "y",
                tm.getVertexY().clone(),
                "z",
                tm.getVertexZ().clone(),
                "a",
                tm.getFaceX().clone(),
                "b",
                tm.getFaceY().clone(),
                "c",
                tm.getFaceZ().clone(),
                "ca",
                tm.getTriangleColorA().clone(),
                "cb",
                tm.getTriangleColorB().clone(),
                "cc",
                tm.getTriangleColorC().clone(),
                "textures",
                tm.getTriangleTextureId() == null ? null : tm.getTriangleTextureId().clone(),
                "terrainUv",
                true));
      } else if (t.getSceneTilePaint() != null
          && x + 1 < heights.length
          && z + 1 < heights[x].length) {
        SceneTilePaint p = t.getSceneTilePaint();
        textures.require(new int[] {p.getTexture()});
        ground.add(TerrainGeometry.paint(w, t, x, z));
      }
      for (GameObject o : t.getGameObjects())
        if (o != null && seen.add(o))
          object(objects, o, o.getRenderable(), o.getModelOrientation(), 0, 0);
      GroundObject g = t.getGroundObject();
      if (g != null) object(objects, g, g.getRenderable(), 0, 0, 0);
      WallObject wall = t.getWallObject();
      if (wall != null) {
        object(objects, wall, wall.getRenderable1(), 0, 0, 0);
        object(objects, wall, wall.getRenderable2(), 0, 0, 0);
      }
      DecorativeObject d = t.getDecorativeObject();
      if (d != null) {
        object(objects, d, d.getRenderable(), 0, d.getXOffset(), d.getYOffset());
        object(objects, d, d.getRenderable2(), 0, d.getXOffset2(), d.getYOffset2());
      }
    }
  }

  void resetScene() {
    animatedObjects.clear();effectKeys.clear();objectKeys.clear();
    pendingObjects.clear();
    sceneBatch = null;
    pendingScene = null;
    nextScene = 0;
    int tick = client.getTickCount(), cycle = client.getGameCycle();
    long ms = recording.elapsed();
    submit(
        () ->
            recording.addAt(
                "object3d", tick, cycle, ms, map("action", "reset", "parts", List.of())));
  }

  void hit(Actor actor, Hitsplat hit) {
    int style = HitStyles.current().resolve(client, hit.getHitsplatType());
    overheads.hit(
        actor,
        hit,
        client.getGameCycle(),
        recording.elapsed(),
        style,
        HitStyles.current().cycles(style));
  }

  private long objectKey(TileObject object) {
    return objectKeys.computeIfAbsent(object, o -> ++nextObject);
  }

  void objectChanged(TileObject object, boolean spawned) {
    if (!running) return;
    pendingObjects.remove(object);
    animatedObjects.remove(object);
    if (!captureObject(object, spawned) && spawned) pendingObjects.put(object, 50);
  }

  private boolean captureObject(TileObject o, boolean spawned) {
    try {
      WorldView w = o.getWorldView(), top = client.getTopLevelWorldView();
      if (w == null || top != w || o.getWorldLocation().getPlane() != w.getPlane()) return true;
      List<Object> parts = new ArrayList<>();
      if (spawned) {
        if (o instanceof GameObject) {
          GameObject g = (GameObject) o;
          object(parts, o, g.getRenderable(), g.getModelOrientation(), 0, 0);
        } else if (o instanceof GroundObject)
          object(parts, o, ((GroundObject) o).getRenderable(), 0, 0, 0);
        else if (o instanceof WallObject) {
          WallObject a = (WallObject) o;
          object(parts, o, a.getRenderable1(), 0, 0, 0);
          object(parts, o, a.getRenderable2(), 0, 0, 0);
        } else if (o instanceof DecorativeObject) {
          DecorativeObject a = (DecorativeObject) o;
          object(parts, o, a.getRenderable(), 0, a.getXOffset(), a.getYOffset());
          object(parts, o, a.getRenderable2(), 0, a.getXOffset2(), a.getYOffset2());
        }
      }
      if (spawned && parts.isEmpty()) return false;
      int tick = client.getTickCount(), cycle = client.getGameCycle();
      long ms = recording.elapsed();
      Map<String, Object> data =
          map(
              "key",
              objectKey(o),
              "action",
              spawned ? "spawn" : "despawn",
              "parts",
              parts,
              "worldView",
              w.getId(),
              "plane",
              w.getPlane(),
              "baseX",
              w.getBaseX(),
              "baseY",
              w.getBaseY());
      submit(() -> {
        for(Map<String,Object> part:(List<Map<String,Object>>)data.getOrDefault("parts",List.of()))encodePart(part,tick,cycle,ms);
        recording.addAt("object3d",tick,cycle,ms,data);
      });
      return true;
    } catch (RuntimeException ex) {
      recording.add(
          "visual_error",
          client.getTickCount(),
          client.getGameCycle(),
          map("source", "object", "error", ex.toString()));
      return true;
    }
  }

  private void object(
      List<Object> list, TileObject o, Renderable r, int orientation, int dx, int dz) {
    if (r == null) return;
    boolean animated=r instanceof DynamicObject;
    if(animated){
      List<AnimatedPart> parts=animatedObjects.computeIfAbsent(o,key->new ArrayList<>());
      if(parts.stream().noneMatch(p->p.renderable==r))parts.add(new AnimatedPart(r,orientation,dx,dz));
    }
    Map<String, Object> m = captureMesh(r instanceof Model ? (Model) r : r.getModel());
    if (m != null)
      list.add(
          map(
              "key",
              objectKey(o),
              "animated",animated,
              "id",
              o.getId(),
              "meshData",
              m,
              "x",
              o.getX() + dx,
              "z",
              o.getY() + dz,
              "height",
              o.getZ(),
              "orientation",
              orientation));
  }

  private synchronized boolean submit(Runnable task) {
    if (!running) return false;
    try {
      encoder.execute(() -> {try{task.run();}catch(RuntimeException error){recording.add("visual_error",0,0,map("source","encoder","error",error.toString()));}});
      return true;
    } catch (RejectedExecutionException e) {
      skipped.incrementAndGet();
      return false;
    }
  }

  synchronized CompletableFuture<Filepath> finish() {
    return finish(CompletableFuture.completedFuture(null));
  }

  synchronized CompletableFuture<Filepath> finish(CompletableFuture<Void> itemWrites) {
    running = false;
    encoder.shutdown();
    // Await on an independent worker, never the client thread. Drain queued frames before EOF.
    return CompletableFuture.supplyAsync(
            () -> {
              try {
                while (!encoder.awaitTermination(1, TimeUnit.SECONDS)) {
                  /* drain */
                }
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new CompletionException(e);
              }
              itemWrites.join();
              recording.add("visual_summary", 0, 0, map("skippedFrames", skipped.get()));
              return recording.close();
            })
        .thenCompose(f -> f);
  }

  static boolean groundEffectVisible(GraphicsObject effect, int plane, int cycle) {
    return !effect.finished() && effect.getLevel() == plane && effect.getStartCycle() <= cycle;
  }

  private void encodePart(Map<String,Object> part,int tick,int cycle,long ms){
    Object geometry=part.remove("meshData");if(geometry!=null)part.put("mesh",recordMesh((Map<String,Object>)geometry,tick,cycle,ms));
  }
  private String recordMesh(Map<String,Object> geometry,int tick,int cycle,long ms){
    Map<String,Object> template=new LinkedHashMap<>(geometry),pose=new LinkedHashMap<>();
    for(String key:new String[]{"x","y","z"})pose.put(key,template.remove(key));
    byte[] templateBytes=GeometryCodec.raw(template),poseBytes=GeometryCodec.raw(pose);
    String templateId=GeometryCodec.id(templateBytes),id=GeometryCodec.id(templateId.getBytes(StandardCharsets.US_ASCII),poseBytes);
    if(!assets.contains(templateId)&&recording.addAt("mesh_template",tick,cycle,ms,map("id",templateId,"encoding","m3d1-zlib","payload",GeometryCodec.payload(templateBytes))))assets.add(templateId);
    if(!assets.contains(id)&&recording.addAt("mesh",tick,cycle,ms,map("id",id,"template",templateId,"encoding","m3d1-zlib","payload",GeometryCodec.payload(poseBytes))))assets.add(id);
    return id;
  }
}

