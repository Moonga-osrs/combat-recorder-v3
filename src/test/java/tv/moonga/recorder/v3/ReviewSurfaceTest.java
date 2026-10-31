package tv.moonga.recorder.v3;
import org.junit.Test;
import java.nio.file.*;
import static org.junit.Assert.*;
public class ReviewSurfaceTest {
 @Test public void runtimeDoesNotLaunchProcessesOrUseReflection() throws Exception {
  try(var files=Files.walk(Path.of("src/main/java"))){
   for(Path p:(Iterable<Path>)files.filter(p->p.toString().endsWith(".java"))::iterator){
    String source=Files.readString(p);
    for(String forbidden:new String[]{"ProcessBuilder","java.lang.reflect","Desktop.getDesktop", "new Gson(", "Filepath.Unchecked", "HttpServer", "System.getenv"}) assertFalse(p+" contains "+forbidden,source.contains(forbidden));
   }
  }
 }
}
