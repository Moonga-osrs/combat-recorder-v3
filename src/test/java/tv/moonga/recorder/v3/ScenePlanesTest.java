package tv.moonga.recorder.v3;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import net.runelite.api.*;
import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
public class ScenePlanesTest {
 @Rule public TemporaryFolder temp=new TemporaryFolder();
 @Test public void capturesLowerFloorsAndDeduplicatesBridgeTiles() throws Exception {
  Client client=mock(Client.class);WorldView world=mock(WorldView.class);Scene scene=mock(Scene.class);Tile[][][] levels=new Tile[4][1][1];
  when(world.getScene()).thenReturn(scene);when(scene.getTiles()).thenReturn(levels);when(world.getPlane()).thenReturn(2);when(world.getTileHeights()).thenReturn(new int[4][2][2]);
  for(int plane=0;plane<4;plane++){Tile tile=mock(Tile.class);SceneTilePaint paint=mock(SceneTilePaint.class);levels[plane][0][0]=tile;when(tile.getRenderLevel()).thenReturn(plane);when(tile.getGameObjects()).thenReturn(new GameObject[0]);when(tile.getSceneTilePaint()).thenReturn(paint);when(paint.getTexture()).thenReturn(-1);}
  when(levels[2][0][0].getBridge()).thenReturn(levels[1][0][0]);
  Recording recording=new Recording(TestFiles.rooted(temp.newFolder().toPath()), new com.google.gson.Gson());VisualCapture capture=new VisualCapture(client,recording,()->50);
  try{VisualCapture.SceneBatch batch=capture.new SceneBatch(world);while(!batch.advance()){}Map<String,Object> data=(Map<String,Object>)batch.result();assertEquals(3,((List<?>)data.get("ground")).size());assertArrayEquals(new int[]{0,1,2},(int[])data.get("capturedPlanes"));assertEquals(1,data.get("width"));assertEquals(1,data.get("height"));}
  finally{capture.finish().get(10,TimeUnit.SECONDS);}
 }
}
