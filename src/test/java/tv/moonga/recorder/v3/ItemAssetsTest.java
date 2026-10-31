package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import com.google.gson.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import javax.imageio.ImageIO;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.game.ItemManager;
import net.runelite.client.util.AsyncBufferedImage;
import org.junit.*;
import org.junit.rules.TemporaryFolder;

public class ItemAssetsTest {
  @Rule public TemporaryFolder temp = new TemporaryFolder();

  @Test
  public void copiesItemSpriteAndDrainsResourceBeforeRecordingCloses() throws Exception {
    ItemManager manager = mock(ItemManager.class);
    AsyncBufferedImage image =
        new AsyncBufferedImage(mock(ClientThread.class), 2, 2, BufferedImage.TYPE_INT_ARGB);
    image.setRGB(0, 0, 0xffff0000);
    when(manager.getImage(100, 5, false)).thenReturn(image);
    Recording recording = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    ItemAssets assets = new ItemAssets(manager, recording);
    assertEquals("100:5", assets.require(100, 5));
    assets.require(100, 5);
    image.loaded();
    image.setRGB(0, 0, 0xff0000ff);
    assets.finish().get(10, TimeUnit.SECONDS);
    List<String> lines = TestFiles.readAllLines(recording.close().get(10, TimeUnit.SECONDS));
    assertEquals(2, lines.size());
    JsonObject data =
        JsonParser.parseString(lines.get(0)).getAsJsonObject().getAsJsonObject("data");
    assertEquals("100:5", data.get("key").getAsString());
    BufferedImage decoded =
        ImageIO.read(
            new ByteArrayInputStream(Base64.getDecoder().decode(data.get("png").getAsString())));
    assertEquals(0xffff0000, decoded.getRGB(0, 0));
    verify(manager, times(1)).getImage(100, 5, false);
  }

  @Test
  public void ignoresLateLoadCallbacksAfterStop() throws Exception {
    ItemManager manager = mock(ItemManager.class);
    AsyncBufferedImage image =
        new AsyncBufferedImage(mock(ClientThread.class), 2, 2, BufferedImage.TYPE_INT_ARGB);
    when(manager.getImage(100, 1, false)).thenReturn(image);
    Recording recording = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    ItemAssets assets = new ItemAssets(manager, recording);
    assets.require(100, 1);
    assets.finish().get(10, TimeUnit.SECONDS);
    net.runelite.client.util.Filepath file = recording.close().get(10, TimeUnit.SECONDS);
    image.loaded();
    assertEquals(1, TestFiles.readAllLines(file).size());
  }
}
