package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import java.util.List;
import java.util.concurrent.TimeUnit;
import net.runelite.api.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;

public class VisualCaptureTest {
  @Rule public TemporaryFolder temp = new TemporaryFolder();

  @Test
  public void delayedGroundEffectsAreHiddenUntilTheirStartCycle() {
    GraphicsObject effect = mock(GraphicsObject.class);
    when(effect.getLevel()).thenReturn(2);
    when(effect.getStartCycle()).thenReturn(100);
    assertFalse(VisualCapture.groundEffectVisible(effect, 2, 99));
    assertTrue(VisualCapture.groundEffectVisible(effect, 2, 100));
    assertFalse(VisualCapture.groundEffectVisible(effect, 1, 101));
    when(effect.finished()).thenReturn(true);
    assertFalse(VisualCapture.groundEffectVisible(effect, 2, 101));
  }

  @Test
  public void meshCopiesClientOwnedArrays() {
    Model m = mock(Model.class);
    float[] x = {1, 2, 3};
    int[] a = {0}, b = {1}, c = {2}, color = {123};
    byte[] alpha = {4};
    when(m.getVerticesCount()).thenReturn(3);
    when(m.getFaceCount()).thenReturn(1);
    when(m.getVerticesX()).thenReturn(x);
    when(m.getVerticesY()).thenReturn(x);
    when(m.getVerticesZ()).thenReturn(x);
    when(m.getFaceIndices1()).thenReturn(a);
    when(m.getFaceIndices2()).thenReturn(b);
    when(m.getFaceIndices3()).thenReturn(c);
    when(m.getFaceColors1()).thenReturn(color);
    when(m.getFaceColors2()).thenReturn(color);
    when(m.getFaceColors3()).thenReturn(color);
    when(m.getFaceTransparencies()).thenReturn(alpha);
    Map<String, Object> copy = VisualCapture.mesh(m);
    x[0] = 999;
    a[0] = 2;
    color[0] = 999;
    alpha[0] = 99;
    assertEquals(1, ((float[]) copy.get("x"))[0], 0);
    assertEquals(0, ((int[]) copy.get("a"))[0]);
    assertEquals(123, ((int[]) copy.get("ca"))[0]);
    assertEquals(4, ((byte[]) copy.get("alpha"))[0]);
    assertNull(VisualCapture.mesh(null));
  }

  @Test
  public void producesOnlyStructuredDataAndStopsBeforeEnd() throws Exception {
    Client c = mock(Client.class);
    Recording r = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    VisualCapture v = new VisualCapture(c, r, () -> 10);
    v.sample();
    net.runelite.client.util.Filepath file = v.finish().get(10, TimeUnit.SECONDS);
    List<String> before = TestFiles.readAllLines(file);
    v.sample();
    assertEquals(before, TestFiles.readAllLines(file));
    assertEquals(
        "end",
        JsonParser.parseString(before.get(before.size() - 1))
            .getAsJsonObject()
            .get("type")
            .getAsString());
    for (String line : before) {
      JsonObject row = JsonParser.parseString(line).getAsJsonObject();
      assertNotEquals("image", row.get("type").getAsString());
    }
    JsonObject header =
        JsonParser.parseString(before.get(0)).getAsJsonObject().getAsJsonObject("data");
    assertFalse(header.get("screenshots").getAsBoolean());
  }

  @Test
  public void asynchronousEventsKeepTheirCaptureTimestamp() throws Exception {
    Recording r = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    r.addAt("frame3d", 12, 20, 1234, Map.of("actors", List.of()));
    JsonObject row =
        JsonParser.parseString(TestFiles.readAllLines(r.close().get(10, TimeUnit.SECONDS)).get(0))
            .getAsJsonObject();
    assertEquals(1234, row.get("ms").getAsLong());
    assertEquals(12, row.get("tick").getAsInt());
    assertEquals(64, GeometryCodec.id(new byte[]{1,2,3}).length());
    assertEquals(GeometryCodec.id(new byte[]{1,2,3}), GeometryCodec.id(new byte[]{1,2,3}));
    assertNotEquals(GeometryCodec.id(new byte[]{1,2,3}), GeometryCodec.id(new byte[]{3,2,1}));
  }

  @Test
  public void recordsObjectSpawnAndDespawnWithSameStableIdentity() throws Exception {
    Client c = mock(Client.class);
    WorldView w = mock(WorldView.class);
    GroundObject object = mock(GroundObject.class);
    when(c.getTopLevelWorldView()).thenReturn(w);
    when(object.getWorldView()).thenReturn(w);
    when(object.getWorldLocation())
        .thenReturn(new net.runelite.api.coords.WorldPoint(3200, 3200, 0));
    Model m = mock(Model.class);
    when(object.getRenderable()).thenReturn(m);
    when(m.getVerticesCount()).thenReturn(3);
    when(m.getFaceCount()).thenReturn(1);
    when(m.getVerticesX()).thenReturn(new float[] {0, 1, 0});
    when(m.getVerticesY()).thenReturn(new float[] {0, 0, 1});
    when(m.getVerticesZ()).thenReturn(new float[] {0, 1, 1});
    when(m.getFaceIndices1()).thenReturn(new int[] {0});
    when(m.getFaceIndices2()).thenReturn(new int[] {1});
    when(m.getFaceIndices3()).thenReturn(new int[] {2});
    when(m.getFaceColors1()).thenReturn(new int[] {100});
    when(m.getFaceColors2()).thenReturn(new int[] {100});
    when(m.getFaceColors3()).thenReturn(new int[] {100});
    Recording r = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    VisualCapture v = new VisualCapture(c, r, () -> 10);
    v.objectChanged(object, true);
    v.objectChanged(object, false);
    List<JsonObject> events = new ArrayList<>();
    for (String line : TestFiles.readAllLines(v.finish().get(10, TimeUnit.SECONDS))) {
      JsonObject row = JsonParser.parseString(line).getAsJsonObject();
      if (row.get("type").getAsString().equals("object3d")) events.add(row.getAsJsonObject("data"));
    }
    assertEquals(2, events.size());
    assertEquals(events.get(0).get("key"), events.get(1).get("key"));
    assertEquals("spawn", events.get(0).get("action").getAsString());
    assertEquals(1, events.get(0).getAsJsonArray("parts").size());
    assertEquals("despawn", events.get(1).get("action").getAsString());
    assertEquals(0, events.get(1).getAsJsonArray("parts").size());
  }
}

