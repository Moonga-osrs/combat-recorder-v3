package tv.moonga.recorder.v3;

import static tv.moonga.recorder.v3.CombatRecorderPlugin.map;

import java.util.*;
import java.util.concurrent.*;
import java.util.function.Function;
import net.runelite.api.*;

/** Copies game texture resources, never rendered frames or screenshots. */
final class TextureCapture {
  private final Client client;
  private final Recording recording;
  private final LinkedHashSet<Integer> pending = new LinkedHashSet<>();
  private final Set<Integer> queued = ConcurrentHashMap.newKeySet();
  private final Queue<Integer> retry = new ConcurrentLinkedQueue<>();

  TextureCapture(Client client, Recording recording) {
    this.client = client;
    this.recording = recording;
  }

  void require(short[] ids) {
    if (ids != null) for (short id : ids) require(id);
  }

  void require(int[] ids) {
    if (ids != null) for (int id : ids) require(id);
  }

  private void require(int id) {
    if (id >= 0 && !queued.contains(id)) pending.add(id);
  }

  void drain(Function<Runnable, Boolean> enqueue) {
    Integer again;
    while ((again = retry.poll()) != null) {
      queued.remove(again);
      require(again);
    }
    TextureProvider provider = client.getTextureProvider();
    if (provider == null) return;
    for (int n = 0; n < 2 && !pending.isEmpty(); n++) {
      int id = pending.iterator().next();
      pending.remove(id);
      Texture[] definitions = provider.getTextures();
      if (definitions == null || id >= definitions.length || definitions[id] == null) continue;
      int[] raw = provider.load(id);
      if (raw == null) {
        pending.add(id);
        continue;
      }
      int size = (int) Math.sqrt(raw.length);
      if (size * size != raw.length || size == 0) continue;
      int[] pixels = raw.clone();
      Texture t = definitions[id];
      int direction = t.getAnimationDirection(), speed = t.getAnimationSpeed();
      long ms = recording.elapsed();
      int tick = client.getTickCount(), cycle = client.getGameCycle();
      queued.add(id);
      if (!enqueue.apply(
          () -> {
            Map<String, Object> data =
                map(
                    "id",
                    id,
                    "width",
                    size,
                    "height",
                    size,
                    "rgba",
                    rgba(pixels),
                    "direction",
                    direction,
                    "speed",
                    speed);
            if (!recording.addAt("texture", tick, cycle, ms, data)) retry.add(id);
          })) {
        queued.remove(id);
        pending.add(id);
      }
    }
  }

  static String rgba(int[] pixels) {
    byte[] rgba = new byte[pixels.length * 4];
    int n = 0;
    for (int rgb : pixels) {
      rgba[n++] = (byte) (rgb >>> 16);
      rgba[n++] = (byte) (rgb >>> 8);
      rgba[n++] = (byte) rgb;
      rgba[n++] = (byte) (rgb == 0 ? 0 : 255);
    }
    return Base64.getEncoder().encodeToString(rgba);
  }
}
