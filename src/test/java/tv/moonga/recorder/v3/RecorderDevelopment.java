package tv.moonga.recorder.v3;
import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;
public final class RecorderDevelopment {
 public static void main(String[] args) throws Exception {
  ExternalPluginManager.loadBuiltin(CombatRecorderPlugin.class);
  RuneLite.main(args);
 }
}
