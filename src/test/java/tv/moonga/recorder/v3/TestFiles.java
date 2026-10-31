package tv.moonga.recorder.v3;
import java.nio.file.*;
import java.util.List;
import java.io.IOException;
import net.runelite.client.util.Filepath;
final class TestFiles {
 static Filepath rooted(Path p){return Filepath.Unchecked.getRooted(p);}
 static List<String> readAllLines(Filepath p) throws IOException{return Files.readAllLines(Filepath.Unchecked.getPath(p));}
 static List<String> readAllLines(Path p) throws IOException{return Files.readAllLines(p);}
}
