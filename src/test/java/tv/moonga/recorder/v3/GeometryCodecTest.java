package tv.moonga.recorder.v3;

import static org.junit.Assert.*;
import com.google.gson.Gson;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.InflaterInputStream;
import java.io.ByteArrayInputStream;
import org.junit.Test;

public class GeometryCodecTest {
  @Test public void losslessAlignedPayloadAndBrowserFixture() throws Exception {
    Map<String,Object> mesh=new LinkedHashMap<>();
    mesh.put("x",new float[]{-128.25f,0,256.5f});
    mesh.put("y",new int[]{-40,0,80});
    mesh.put("z",new float[]{0,128,256});
    mesh.put("a",new int[]{0});mesh.put("b",new int[]{1});mesh.put("c",new int[]{2});
    mesh.put("ca",new int[]{100});mesh.put("cb",new int[]{200});mesh.put("cc",new int[]{300});
    mesh.put("alpha",new byte[]{(byte)200});mesh.put("textures",new short[]{-1});
    mesh.put("priorities",new byte[]{10});mesh.put("uvs",new float[]{0,0,1,0,1,1});
    byte[] raw=GeometryCodec.raw(mesh);
    GeometryCodec.Encoded encoded=GeometryCodec.encode(mesh);
    byte[] inflated;
    try(InflaterInputStream input=new InflaterInputStream(new ByteArrayInputStream(Base64.getDecoder().decode(encoded.payload)))){inflated=input.readAllBytes();}
    assertArrayEquals(raw,inflated);
    ByteBuffer header=ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN);
    assertEquals(0x3144334d,header.getInt());assertEquals(1,header.getInt());assertEquals(mesh.size(),header.getInt());
    assertEquals(encoded.id,GeometryCodec.id(raw));
    Path output=Path.of("build","codec-fixture.json");Files.createDirectories(output.getParent());
    Files.writeString(output,new Gson().toJson(Map.of("encoding","m3d1-zlib","payload",encoded.payload)));
  }
}
