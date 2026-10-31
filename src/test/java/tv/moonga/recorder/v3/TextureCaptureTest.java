package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import net.runelite.api.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;

public class TextureCaptureTest {
  @Rule public TemporaryFolder temp = new TemporaryFolder();

  @Test
  public void copiesResourcePixelsBeforeWorkerEncodingAndExportsOnlyOnce() throws Exception {
    Client c = mock(Client.class);
    TextureProvider provider = mock(TextureProvider.class);
    Texture texture = mock(Texture.class);
    when(c.getTextureProvider()).thenReturn(provider);
    when(provider.getTextures()).thenReturn(new Texture[] {texture});
    int[] pixels = {0xff0000, 0x00ff00, 0, 0xffffff};
    when(provider.load(0)).thenReturn(pixels);
    when(texture.getAnimationDirection()).thenReturn(2);
    Recording r = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    TextureCapture textures = new TextureCapture(c, r);
    List<Runnable> tasks = new ArrayList<>();
    textures.require(new short[] {0, 0, -1});
    textures.drain(
        task -> {
          tasks.add(task);
          return true;
        });
    pixels[0] = 0;
    tasks.forEach(Runnable::run);
    textures.require(new int[] {0});
    textures.drain(
        task -> {
          fail("Texture was already queued");
          return false;
        });
    List<String> lines = TestFiles.readAllLines(r.close().get(10, TimeUnit.SECONDS));
    assertEquals(2, lines.size());
    JsonObject data =
        JsonParser.parseString(lines.get(0)).getAsJsonObject().getAsJsonObject("data");
    assertEquals(2, data.get("width").getAsInt());
    assertEquals(2, data.get("direction").getAsInt());
    byte[] rgba = Base64.getDecoder().decode(data.get("rgba").getAsString());
    assertEquals(255, rgba[0] & 255);
    assertEquals(255, rgba[3] & 255);
    assertEquals(0, rgba[11]);
  }

  @Test
  public void retriesWhenEncoderCannotAcceptTexture() throws Exception {
    Client c = mock(Client.class);
    TextureProvider provider = mock(TextureProvider.class);
    Texture texture = mock(Texture.class);
    when(c.getTextureProvider()).thenReturn(provider);
    when(provider.getTextures()).thenReturn(new Texture[] {texture});
    when(provider.load(0)).thenReturn(new int[] {0xffffff});
    Recording r = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    TextureCapture textures = new TextureCapture(c, r);
    textures.require(new int[] {0});
    textures.drain(task -> false);
    List<Runnable> tasks = new ArrayList<>();
    textures.drain(
        task -> {
          tasks.add(task);
          return true;
        });
    assertEquals(1, tasks.size());
    tasks.forEach(Runnable::run);
    assertEquals(2, TestFiles.readAllLines(r.close().get(10, TimeUnit.SECONDS)).size());
  }
}
