package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import net.runelite.api.*;
import net.runelite.api.coords.LocalPoint;
import org.junit.*;
import org.junit.rules.TemporaryFolder;

public class PlayerStateTest {
  @Rule public TemporaryFolder temp = new TemporaryFolder();

  @Test
  public void capturesPrayerAndInventoryChangesWithoutWaitingForServerTick() throws Exception {
    Client c = mock(Client.class);
    ItemContainer bag = mock(ItemContainer.class);
    when(c.getItemContainer(InventoryID.INVENTORY)).thenReturn(bag);
    when(bag.getItems()).thenReturn(new Item[] {new Item(100, 3)});
    ItemComposition def = mock(ItemComposition.class);
    when(def.getName()).thenReturn("Test item");
    when(c.getItemDefinition(100)).thenReturn(def);
    Recording r = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    PlayerState state = new PlayerState(c, r);
    state.sample();
    state.sample();
    when(c.isPrayerActive(Prayer.PROTECT_FROM_MELEE)).thenReturn(true);
    when(bag.getItems()).thenReturn(new Item[] {new Item(100, 2)});
    state.sample();
    List<JsonObject> rows = new ArrayList<>();
    for (String line : TestFiles.readAllLines(r.close().get(10, TimeUnit.SECONDS))) {
      JsonObject row = JsonParser.parseString(line).getAsJsonObject();
      if (row.get("type").getAsString().equals("player_state"))
        rows.add(row.getAsJsonObject("data"));
    }
    assertEquals(2, rows.size());
    assertEquals(
        3,
        rows.get(0)
            .getAsJsonArray("inventory")
            .get(0)
            .getAsJsonObject()
            .get("quantity")
            .getAsInt());
    assertEquals(
        2,
        rows.get(1)
            .getAsJsonArray("inventory")
            .get(0)
            .getAsJsonObject()
            .get("quantity")
            .getAsInt());
    assertEquals("PROTECT_FROM_MELEE", rows.get(1).getAsJsonArray("prayers").get(0).getAsString());
  }

  @Test
  public void distinctGroundStacksSurviveQuantityChangeRemovalAndSceneReset() throws Exception {
    Client c = mock(Client.class);
    Tile t = mock(Tile.class);
    when(t.getLocalLocation()).thenReturn(new LocalPoint(128, 256));
    TileItem first = mock(TileItem.class), second = mock(TileItem.class);
    when(first.getId()).thenReturn(100);
    when(second.getId()).thenReturn(100);
    when(first.getQuantity()).thenReturn(2);
    when(second.getQuantity()).thenReturn(7);
    Recording r = new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());
    PlayerState state = new PlayerState(c, r);
    state.ground(t, first);
    state.ground(t, second);
    Map<String, Object> initial = state.snapshot();
    when(first.getQuantity()).thenReturn(5);
    state.ground(t, first);
    state.removeGround(second);
    JsonObject before = new Gson().toJsonTree(initial).getAsJsonObject(),
        after = new Gson().toJsonTree(state.snapshot()).getAsJsonObject();
    assertEquals(2, before.getAsJsonArray("groundItems").size());
    assertEquals(
        2,
        before.getAsJsonArray("groundItems").get(0).getAsJsonObject().get("quantity").getAsInt());
    assertEquals(1, after.getAsJsonArray("groundItems").size());
    assertEquals(
        5, after.getAsJsonArray("groundItems").get(0).getAsJsonObject().get("quantity").getAsInt());
    state.clearGround();
    assertTrue(((List<?>) state.snapshot().get("groundItems")).isEmpty());
    r.close().get(10, TimeUnit.SECONDS);
  }
}
