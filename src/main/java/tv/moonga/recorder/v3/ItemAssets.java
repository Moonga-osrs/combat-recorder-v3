package tv.moonga.recorder.v3;

import static tv.moonga.recorder.v3.CombatRecorderPlugin.map;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.concurrent.*;
import javax.imageio.ImageIO;
import net.runelite.client.game.ItemManager;
import net.runelite.client.util.AsyncBufferedImage;

/** Item sprites only: this never reads the game canvas. PNG compression runs off-thread. */
final class ItemAssets {
  private final ItemManager items;
  private final Recording recording;
  private final Set<String> requested = ConcurrentHashMap.newKeySet();
  private final ThreadPoolExecutor worker =
      new ThreadPoolExecutor(
          1,
          1,
          0,
          TimeUnit.SECONDS,
          new ArrayBlockingQueue<>(64),
          r -> {
            Thread t = new Thread(r, "moonga-item-icons");
            t.setDaemon(true);
            return t;
          });
  private volatile boolean active = true;

  ItemAssets(ItemManager items, Recording recording) {
    this.items = items;
    this.recording = recording;
  }

  String require(int id, int quantity) {
    String key = id + ":" + quantity;
    if (!active || !requested.add(key)) return key;
    AsyncBufferedImage image = items.getImage(id, quantity, false);
    if (image == null) {
      requested.remove(key);
      return key;
    }
    image.onLoaded(
        () -> {
          if (!active) return;
          BufferedImage copy =
              new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_ARGB);
          Graphics2D g = copy.createGraphics();
          try {
            g.drawImage(image, 0, 0, null);
          } finally {
            g.dispose();
          }
          try {
            worker.execute(
                () -> {
                  try {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    if (!ImageIO.write(copy, "png", out))
                      throw new IllegalStateException("PNG encoder unavailable");
                    if (!recording.addAt(
                        "item_icon",
                        0,
                        0,
                        recording.elapsed(),
                        map(
                            "key",
                            key,
                            "id",
                            id,
                            "quantity",
                            quantity,
                            "png",
                            Base64.getEncoder().encodeToString(out.toByteArray()))))
                      requested.remove(key);
                  } catch (Exception e) {
                    requested.remove(key);
                    recording.add("item_icon_error", 0, 0, map("id", id, "error", e.toString()));
                  }
                });
          } catch (RejectedExecutionException e) {
            requested.remove(key);
          }
        });
    return key;
  }

  CompletableFuture<Void> finish() {
    active = false;
    worker.shutdown();
    return CompletableFuture.runAsync(
        () -> {
          try {
            while (!worker.awaitTermination(1, TimeUnit.SECONDS)) {
              /* drain item resource writes */
            }
          } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CompletionException(e);
          }
        });
  }
}
