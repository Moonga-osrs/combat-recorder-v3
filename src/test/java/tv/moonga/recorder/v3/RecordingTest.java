package tv.moonga.recorder.v3;

import static org.junit.Assert.*;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;

public class RecordingTest {
  @Rule public TemporaryFolder temp = new TemporaryFolder();

  @Test
  public void preservesOrderAndFlushesBeforeCompletion() throws Exception {
    Recording r = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    for (int i = 0; i < 1000; i++) r.add("tick", i, 3 * i, Map.of("value", i));
    net.runelite.client.util.Filepath p = r.close().get(10, TimeUnit.SECONDS);
    List<String> lines = TestFiles.readAllLines(p);
    assertEquals(1001, lines.size());
    for (int i = 0; i < 1000; i++) {
      JsonObject row = new JsonParser().parse(lines.get(i)).getAsJsonObject();
      assertEquals(i, row.get("seq").getAsInt());
      assertEquals(i, row.getAsJsonObject("data").get("value").getAsInt());
    }
    assertTrue(
        new JsonParser()
            .parse(lines.get(1000))
            .getAsJsonObject()
            .getAsJsonObject("data")
            .get("complete")
            .getAsBoolean());
    assertEquals(0, r.dropped());
    assertNull(r.error());
    r.add("late", 1, 1, Map.of());
    assertEquals(p, r.close().get());
    assertEquals(1001, TestFiles.readAllLines(p).size());
  }

  @Test
  public void freezesMutablePayloadBeforeDiskWrite() throws Exception {
    Recording r = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    Map<String, Object> data = new HashMap<>();
    data.put("x", 1);
    r.add("actor", 1, 1, data);
    data.put("x", 99);
    String row = TestFiles.readAllLines(r.close().get(10, TimeUnit.SECONDS)).get(0);
    assertEquals(
        1,
        new JsonParser().parse(row).getAsJsonObject().getAsJsonObject("data").get("x").getAsInt());
  }

  @Test
  public void reportsAllRowsOrExplicitLossUnderPressure() throws Exception {
    Recording r = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    int count = 30000;
    for (int i = 0; i < count; i++) r.add("event", i, i, Map.of("text", "x".repeat(300)));
    List<String> rows = TestFiles.readAllLines(r.close().get(20, TimeUnit.SECONDS));
    assertEquals(count, rows.size() - 1 + r.dropped());
  }

  @Test
  public void failsClearlyIfDirectoryIsAFile() throws Exception {
    try {
      new Recording(TestFiles.rooted(temp.newFile().toPath()), new com.google.gson.Gson());
      fail("Must fail");
    } catch (java.io.IOException expected) {
    }
  }
}
