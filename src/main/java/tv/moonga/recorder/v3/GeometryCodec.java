package tv.moonga.recorder.v3;

import java.io.*;

import java.nio.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;

/** Lossless typed-array payload. No JSON conversion or compression on the game thread. */
final class GeometryCodec {
  static final String[] FIELDS={"x","y","z","a","b","c","ca","cb","cc","alpha","textures","textureFaces","texA","texB","texC","override","priorities","uvs"};
  static final int[] WIDTHS={4,4,4,4,4,4,4,4,4,1,2,1,4,4,4,4,1,4};
  static final class Encoded {
    final String id, payload;
    Encoded(String id,String payload){this.id=id;this.payload=payload;}
  }
  static int arrayLength(Object value) {
    if(value instanceof float[])return ((float[])value).length;
    if(value instanceof int[])return ((int[])value).length;
    if(value instanceof short[])return ((short[])value).length;
    if(value instanceof byte[])return ((byte[])value).length;
    throw new IllegalArgumentException("Unsupported geometry array");
  }
  static float floatAt(Object value,int index) {
    if(value instanceof float[])return ((float[])value)[index];
    if(value instanceof int[])return ((int[])value)[index];
    throw new IllegalArgumentException("Unsupported vertex array");
  }
  static byte[] raw(Map<String,Object> geometry){
    int size=12,count=0;
    for(int i=0;i<FIELDS.length;i++){Object value=geometry.get(FIELDS[i]);if(value!=null){size+=8+((arrayLength(value)*WIDTHS[i]+3)&~3);count++;}}
    ByteBuffer out=ByteBuffer.allocate(size).order(ByteOrder.LITTLE_ENDIAN);out.putInt(0x3144334d).putInt(1).putInt(count);
    for(int id=0;id<FIELDS.length;id++){
      Object value=geometry.get(FIELDS[id]);if(value==null)continue;int length=arrayLength(value);out.putInt(id).putInt(length);
      if(id<=2||id==17){if(value instanceof float[])for(float n:(float[])value)out.putFloat(n);else if(value instanceof int[])for(int n:(int[])value)out.putFloat(n);else throw new IllegalArgumentException("Unsupported vertex array");}
      else if(WIDTHS[id]==1)out.put((byte[])value);
      else if(WIDTHS[id]==2)for(short n:(short[])value)out.putShort(n);
      else for(int n:(int[])value)out.putInt(n);
      while((out.position()&3)!=0)out.put((byte)0);
    }
    return out.array();
  }
  static Encoded encode(Map<String,Object> geometry){
    byte[] raw=raw(geometry);return new Encoded(id(raw),payload(raw));
  }
  static String id(byte[]... arrays){
    try{MessageDigest hash=MessageDigest.getInstance("SHA-256");for(byte[] bytes:arrays)hash.update(bytes);byte[] digest=hash.digest();char[] hex="0123456789abcdef".toCharArray(),id=new char[digest.length*2];for(int i=0;i<digest.length;i++){id[i*2]=hex[(digest[i]&255)>>>4];id[i*2+1]=hex[digest[i]&15];}return new String(id);}catch(Exception error){throw new IllegalStateException(error);}
  }
  static String payload(byte[] raw){
    try{
      ByteArrayOutputStream bytes=new ByteArrayOutputStream();Deflater compressor=new Deflater(Deflater.BEST_SPEED);
      try(DeflaterOutputStream stream=new DeflaterOutputStream(bytes,compressor)){stream.write(raw);}finally{compressor.end();}
      return Base64.getEncoder().encodeToString(bytes.toByteArray());
    }catch(Exception error){throw new IllegalStateException("Could not encode mesh",error);}
  }

  static Map<String,Object> mergeTerrain(List<Map<String,Object>> tiles){
    int vertices=0,faces=0;for(Map<String,Object> tile:tiles){vertices+=arrayLength(tile.get("x"));faces+=((int[])tile.get("a")).length;}
    float[] x=new float[vertices],y=new float[vertices],z=new float[vertices],uvs=new float[faces*6];int[] a=new int[faces],b=new int[faces],c=new int[faces],ca=new int[faces],cb=new int[faces],cc=new int[faces];short[] textures=new short[faces];Arrays.fill(textures,(short)-1);
    int vo=0,fo=0;
    for(Map<String,Object> tile:tiles){int count=arrayLength(tile.get("x"));float minX=Float.POSITIVE_INFINITY,minZ=Float.POSITIVE_INFINITY;
      for(int i=0;i<count;i++){x[vo+i]=floatAt(tile.get("x"),i);y[vo+i]=floatAt(tile.get("y"),i);z[vo+i]=floatAt(tile.get("z"),i);minX=Math.min(minX,x[vo+i]);minZ=Math.min(minZ,z[vo+i]);}
      minX=(float)Math.floor(minX/128)*128;minZ=(float)Math.floor(minZ/128)*128;
      int[] ta=(int[])tile.get("a"),tb=(int[])tile.get("b"),tc=(int[])tile.get("c");Object tex=tile.get("textures");
      for(int i=0;i<ta.length;i++){int target=fo+i;a[target]=ta[i]+vo;b[target]=tb[i]+vo;c[target]=tc[i]+vo;ca[target]=((int[])tile.get("ca"))[i];cb[target]=((int[])tile.get("cb"))[i];cc[target]=((int[])tile.get("cc"))[i];if(tex!=null)textures[target]=((short[])tex)[i];int[] ids={a[target],b[target],c[target]};for(int k=0;k<3;k++){uvs[target*6+k*2]=(x[ids[k]]-minX)/128;uvs[target*6+k*2+1]=(z[ids[k]]-minZ)/128;}}
      vo+=count;fo+=ta.length;
    }
    Map<String,Object> result=new LinkedHashMap<>();Object[] values={x,y,z,a,b,c,ca,cb,cc};for(int i=0;i<9;i++)result.put(FIELDS[i],values[i]);result.put("textures",textures);result.put("uvs",uvs);return result;
  }
}
