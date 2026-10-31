package tv.moonga.recorder.v3;

import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import net.runelite.api.Client;

final class HitStyles {
  private static final HitStyles CURRENT = load();
  private final JsonObject definitions;

  HitStyles(JsonObject definitions) {
    this.definitions = definitions;
  }

  static HitStyles current() {
    return CURRENT;
  }

  private static HitStyles load() {
    try (InputStream in = HitStyles.class.getResourceAsStream("/hitsplat-definitions.json")) {
      if (in == null) throw new IOException("Missing hitsplat definitions");
      return new HitStyles(
          new JsonParser().parse(new InputStreamReader(in, StandardCharsets.UTF_8))
              .getAsJsonObject());
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  int resolve(Client client, int type) {
    Set<Integer> seen = new HashSet<>();
    int style = type;
    while (style >= 0 && seen.add(style)) {
      JsonObject d = definitions.getAsJsonObject(Integer.toString(style));
      if (d == null || !d.has("multihitsplats")) return style;
      JsonArray choices = d.getAsJsonArray("multihitsplats");
      if (choices.size() == 0) return style;
      int state = -1;
      try {
        int varbit = d.get("varbitID").getAsInt(), varp = d.get("varpID").getAsInt();
        if (varbit >= 0) state = client.getVarbitValue(varbit);
        else if (varp >= 0) state = client.getVarpValue(varp);
      } catch (RuntimeException ignored) {
        /* use the definition's fallback */
      }
      int index = state >= 0 && state < choices.size() - 1 ? state : choices.size() - 1;
      style = choices.get(index).getAsInt();
    }
    return style < 0 ? -1 : type;
  }

  int cycles(int style) {
    JsonObject d = definitions.getAsJsonObject(Integer.toString(style));
    return d == null ? 0 : d.get("displayCycles").getAsInt();
  }
}
