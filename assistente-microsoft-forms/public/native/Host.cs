using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Text.RegularExpressions;
class Host {
 static byte[] Read(Stream s,int count) {var b=new byte[count];int p=0;while(p<count){int n=s.Read(b,p,count-p);if(n==0)throw new EndOfStreamException();p+=n;}return b;}
 static int Main(string[] args) {
  string dir=AppDomain.CurrentDomain.BaseDirectory;
  // Browser origin is also enforced by the native manifest. Direct execution is used for local tests.
  if(args.Length>0 && (!Regex.IsMatch(args[0],"^chrome-extension://[a-p]{32}/$") || !File.ReadAllText(Path.Combine(dir,"com.gssf.simulado_word.json")).Contains("\""+args[0]+"\"")))return 3;
  string tmp=Path.Combine(Path.GetTempPath(),"GSSF-Simulado",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(tmp);
  string req=Path.Combine(tmp,"request.json"),resp=Path.Combine(tmp,"response.json");
  string answer="{\"ok\":false,\"error\":\"Falha no conector do Word.\"}";
  try {
   Stream input=Console.OpenStandardInput();int len=BitConverter.ToInt32(Read(input,4),0);
   if(len<2||len>64*1024*1024)throw new InvalidDataException("Tamanho de mensagem inválido");
   File.WriteAllBytes(req,Read(input,len));
   using(var mutex=new Mutex(false,"Local\\GSSFSimuladoWord")) {
    bool acquired=false;try{acquired=mutex.WaitOne(300000);}catch(AbandonedMutexException){acquired=true;}
    if(!acquired)throw new TimeoutException("Outra prova ainda está sendo preparada.");
    try {
     var info=new ProcessStartInfo(Path.Combine(dir,"WordWorker.exe"));
     info.Arguments="\""+req+"\" \""+resp+"\"";
     info.UseShellExecute=false;info.CreateNoWindow=true;info.RedirectStandardOutput=true;info.RedirectStandardError=true;
     using(var p=Process.Start(info)) {
      var stdout=p.StandardOutput.ReadToEndAsync();var stderr=p.StandardError.ReadToEndAsync();
      if(!p.WaitForExit(600000)){p.Kill();throw new TimeoutException("O Word demorou mais de 10 minutos. Confira se há uma janela aguardando uma resposta.");}
      File.WriteAllText(Path.Combine(tmp,"worker.log"),stdout.Result+stderr.Result,Encoding.UTF8);
     }
     if(File.Exists(resp))answer=File.ReadAllText(resp,Encoding.UTF8);
    } finally {mutex.ReleaseMutex();}
   }
  } catch(Exception ex){answer="{\"ok\":false,\"error\":\""+ex.Message.Replace("\\","\\\\").Replace("\"","\\\"").Replace("\r"," ").Replace("\n"," ")+"\"}";}
  byte[] bytes=Encoding.UTF8.GetBytes(answer);if(bytes.Length>1024*1024)bytes=Encoding.UTF8.GetBytes("{\"ok\":false,\"error\":\"Resposta excedeu o limite do navegador.\"}");
  var output=Console.OpenStandardOutput();output.Write(BitConverter.GetBytes(bytes.Length),0,4);output.Write(bytes,0,bytes.Length);output.Flush();return 0;
 }
}
