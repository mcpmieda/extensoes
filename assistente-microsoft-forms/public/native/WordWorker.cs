using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Runtime.InteropServices;
using System.Reflection;
using System.Web.Script.Serialization;
using Microsoft.Win32;
class WordWorker {
 static JavaScriptSerializer json=new JavaScriptSerializer(){MaxJsonLength=67108864,RecursionLimit=100};
 static string root=AppDomain.CurrentDomain.BaseDirectory;
 static object Get(Dictionary<string,object> d,string key,object fallback=null){object o;return d.TryGetValue(key,out o)?o:fallback;}
 static string Str(Dictionary<string,object> d,string key,string fallback=""){return Convert.ToString(Get(d,key,fallback));}
 static void Write(string path,object value){File.WriteAllText(path,json.Serialize(value),new UTF8Encoding(false));}
 static Dictionary<string,object> Read(string path){return json.Deserialize<Dictionary<string,object>>(File.ReadAllText(path,Encoding.UTF8));}
 // Reading anchor coordinates forces Word to finish the floating-object layout.
 // Repaginate alone can leave stale positions; saving afterwards persists the correct layout.
 static void CompleteLayout(dynamic document){
  document.Repaginate();
  foreach(dynamic shape in document.Shapes){
   int page=Convert.ToInt32(shape.Anchor.Information[3]);
   double x=Convert.ToDouble(shape.Anchor.Information[5]),y=Convert.ToDouble(shape.Anchor.Information[6]);
  }
 }
 static void Python(Dictionary<string,object> config,string action,string request,string output){
  var info=new ProcessStartInfo(Str(config,"python"));info.UseShellExecute=false;info.CreateNoWindow=true;info.RedirectStandardError=true;info.RedirectStandardOutput=true;
  info.Arguments="\""+Path.Combine(root,"template.py")+"\" "+action+" \""+Str(config,"template")+"\" \""+request+"\" \""+output+"\"";
  using(var p=Process.Start(info)){var a=p.StandardOutput.ReadToEndAsync();var b=p.StandardError.ReadToEndAsync();if(!p.WaitForExit(120000)){p.Kill();throw new Exception("Tempo limite ao preparar o modelo.");}if(p.ExitCode!=0)throw new Exception("Falha ao preparar modelo: "+b.Result);}
 }
 static string ValidPath(Dictionary<string,object> config,string path){
  var full=Path.GetFullPath(path);var folder=Path.GetFullPath(Str(config,"outputDirectory")).TrimEnd('\\')+"\\";
  if(!full.StartsWith(folder,StringComparison.OrdinalIgnoreCase)||!(full.EndsWith(".docx",StringComparison.OrdinalIgnoreCase)||full.EndsWith(".pdf",StringComparison.OrdinalIgnoreCase)))throw new Exception("Arquivo fora da pasta de provas geradas.");
  if(!File.Exists(full))throw new Exception("O arquivo foi movido ou não existe mais.");return full;
 }
 static void Install(string id){
  if(!Regex.IsMatch(id,"^[a-p]{32}$"))throw new Exception("ID de extensão inválido.");
  string user=Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),python=Path.Combine(user,".cache","codex-runtimes","codex-primary-runtime","dependencies","python","python.exe");
  if(!File.Exists(python))throw new Exception("Runtime Python do Codex não encontrado.");
  string dependencies=Path.GetFullPath(Path.Combine(Path.GetDirectoryName(python),".."));
  string installRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"GSSF","WordConnector"),native=Path.Combine(installRoot,"native"),assets=Path.Combine(installRoot,"assets");
  string[] files={"GssfWordHost.exe","WordWorker.exe","template.py","year-art.cjs","FormatarQuestoesSimuladoV6.bas"};
  string template=Path.GetFullPath(Path.Combine(root,"..","assets","simulado-modelo.docx"));
  // Validate everything before changing browser registration. Keep the companion outside versioned extension folders.
  foreach(string file in files)if(!File.Exists(Path.Combine(root,file)))throw new Exception("Arquivo do conector ausente: "+file);
  if(!File.Exists(template))throw new Exception("Modelo do simulado ausente.");
  if(!File.Exists(Path.Combine(dependencies,"node","bin","node.exe")))throw new Exception("Runtime Node do Codex não encontrado.");
  Directory.CreateDirectory(native);Directory.CreateDirectory(assets);
  if(!Path.GetFullPath(root).TrimEnd('\\').Equals(Path.GetFullPath(native),StringComparison.OrdinalIgnoreCase)){
   foreach(string file in files)File.Copy(Path.Combine(root,file),Path.Combine(native,file),true);
   File.Copy(template,Path.Combine(assets,"simulado-modelo.docx"),true);
  }
  string manifest=Path.Combine(native,"com.gssf.simulado_word.json"),configPath=Path.Combine(native,"config.json");
  var origins=new List<string>();
  if(File.Exists(manifest)){
   var previous=Get(Read(manifest),"allowed_origins") as System.Collections.IEnumerable;
   if(previous!=null)foreach(object value in previous){string origin=Convert.ToString(value);if(Regex.IsMatch(origin,"^chrome-extension://[a-p]{32}/$")&&!origins.Contains(origin))origins.Add(origin);}
  }
  string currentOrigin="chrome-extension://"+id+"/";if(!origins.Contains(currentOrigin))origins.Add(currentOrigin);
  string output=File.Exists(configPath)?Str(Read(configPath),"outputDirectory"):"";if(output.Length==0)output=Path.Combine(user,"Downloads","Simulados Assistente Forms");
  Write(configPath,new {python=python,node=Path.Combine(dependencies,"node","bin","node.exe"),nodeModules=Path.Combine(dependencies,"node","node_modules"),template=Path.Combine(assets,"simulado-modelo.docx"),outputDirectory=output});
  Write(manifest,new {name="com.gssf.simulado_word",description="Word local para formatação fiel do simulado",path=Path.Combine(native,"GssfWordHost.exe"),type="stdio",allowed_origins=origins.ToArray()});
  foreach(RegistryView view in new[]{RegistryView.Registry32,RegistryView.Registry64})
   using(var userKey=RegistryKey.OpenBaseKey(RegistryHive.CurrentUser,view))
    foreach(string browser in new[]{"Software\\Microsoft\\Edge","Software\\Google\\Chrome"})
     using(var key=userKey.CreateSubKey(browser+"\\NativeMessagingHosts\\com.gssf.simulado_word")){key.SetValue("",manifest,RegistryValueKind.String);}
  Console.WriteLine("Conector registrado para Edge e Chrome. ID autorizado: "+id);
  Console.WriteLine("Pasta do conector: "+installRoot);
 }
 [STAThread] static int Main(string[] args){
  if(args.Length>=1&&args.Length<=2&&args[0]=="--install"){try{
   string id=args.Length==2?args[1]:"";
   if(id.Length==0){Console.WriteLine("Copie o ID mostrado em Finalizar simulado > Configurar conector Word.");Console.Write("ID desta instalação da extensão: ");id=(Console.ReadLine()??"").Trim();}
   Install(id);return 0;
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
  if(args.Length==2&&args[0]=="--print-options"){
   try{
    var cfg=Read(Path.Combine(root,"config.json"));string file=ValidPath(cfg,args[1]);dynamic app;
    app=Activator.CreateInstance(Type.GetTypeFromProgID("Word.Application"));
    app.Visible=true;dynamic active=null;
    foreach(dynamic d in app.Documents)if(Convert.ToString(d.FullName).Equals(file,StringComparison.OrdinalIgnoreCase)){active=d;break;}
    if(active==null)active=app.Documents.Open(file,false,false,false);
    active.Activate();app.ActiveWindow.View.Type=3;CompleteLayout(active);app.CommandBars.ExecuteMso("FilePrint");return 0;
   }catch(Exception e){File.WriteAllText(Path.Combine(root,"print-options.log"),e.ToString());return 1;}
  }
  if(args.Length!=2)return 2;string request=args[0],response=args[1];dynamic word=null,doc=null,previousDoc=null;bool owned=false;string stage="início";
  try{
   var config=Read(Path.Combine(root,"config.json"));var data=Read(request);string action=Str(data,"action");
   if(action=="status"){
    bool wordAvailable=Type.GetTypeFromProgID("Word.Application")!=null;
    bool runtimesAvailable=File.Exists(Str(config,"python"))&&File.Exists(Str(config,"node"))&&Directory.Exists(Str(config,"nodeModules"));
    bool templateAvailable=File.Exists(Str(config,"template"));
    Write(response,new{ok=true,version="15.10.3",macro="6.3",wordAvailable=wordAvailable,runtimesAvailable=runtimesAvailable,templateAvailable=templateAvailable,ready=wordAvailable&&runtimesAvailable&&templateAvailable,outputDirectory=Str(config,"outputDirectory")});return 0;
   }
   if(action=="model"){Python(config,"model",request,response);return 0;}
   if(action=="open"){
   var path=ValidPath(config,Str(data,"path"));
    if(path.EndsWith(".docx",StringComparison.OrdinalIgnoreCase)&&Convert.ToBoolean(Get(data,"print",false))){
     Process.Start(new ProcessStartInfo(Path.Combine(root,"WordWorker.exe")){Arguments="--print-options \""+path+"\"",UseShellExecute=false,CreateNoWindow=true});
     Write(response,new{ok=true,printOptionsRequested=true});return 0;
    }
    if(path.EndsWith(".pdf",StringComparison.OrdinalIgnoreCase)){Process.Start(new ProcessStartInfo(path){UseShellExecute=true});}
    else{
     word=Activator.CreateInstance(Type.GetTypeFromProgID("Word.Application"));
     word.Visible=true;
     foreach(dynamic d in word.Documents){if(Convert.ToString(d.FullName).Equals(path,StringComparison.OrdinalIgnoreCase)){doc=d;break;}}
     if(doc==null)doc=word.Documents.Open(path,false,false,false);doc.Activate();word.ActiveWindow.View.Type=3;CompleteLayout(doc);
    }
    Write(response,new{ok=true});doc=null;word=null;return 0;
   }
   if(action!="generate")throw new Exception("Ação não permitida no conector do simulado.");
   string html=Str(data,"html");if(html.Length<20||html.Length>64000000)throw new Exception("Questões inválidas ou grandes demais.");
   var options=Get(data,"options") as Dictionary<string,object>;if(options==null)throw new Exception("Configuração inválida.");
   int year=Convert.ToInt32(Get(options,"year",2026));if(year<2000||year>2099)throw new Exception("Escolha um ano entre 2000 e 2099.");
   string job=Path.GetDirectoryName(request),prepared=Path.Combine(job,"modelo.docx");Python(config,"prepare",request,prepared);
   var sourceInfo=Read(Path.ChangeExtension(prepared,".source.json"));
   string folder=Str(config,"outputDirectory");Directory.CreateDirectory(folder);
   string title=Regex.Replace(Str(data,"title","Simulado"),@"[^\p{L}\p{N}\s_.-]","").Trim();if(title.Length==0)title="Simulado";if(title.Length>100)title=title.Substring(0,100);
   string stem=title+"-"+year+"-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+"-"+Guid.NewGuid().ToString("N").Substring(0,6),output=Path.Combine(folder,stem+".docx"),pdf=Path.Combine(job,"verificacao.pdf");
   stage="abrir Word";
   word=Activator.CreateInstance(Type.GetTypeFromProgID("Word.Application"));owned=true;word.Visible=false;
   stage="abrir modelo";doc=word.Documents.Open(prepared,false,false,false);
   string areas=Str(options,"areas").Trim();if(areas.Length>0){if(!areas.StartsWith("1|"))throw new Exception("A primeira área deve começar em 1.");doc.Variables.Add("GSS_AREAS",areas);}
   stage="executar macro";doc.Activate();
   object[] macroArgs=new object[31];for(int i=0;i<macroArgs.Length;i++)macroArgs[i]=Type.Missing;
   macroArgs[0]="FormatarQuestoesSimuladoV5.FORMATAR_QUESTOES_TESTE";macroArgs[1]=Path.ChangeExtension(prepared,".doc");
   object wordObject=(object)word;
   string result=Convert.ToString(wordObject.GetType().InvokeMember("Run",BindingFlags.InvokeMethod,null,wordObject,macroArgs));
   if(!result.StartsWith("OK|"))throw new Exception("A macro cancelou a exportação: "+result);
   string[] parts=result.Split('|');int count=int.Parse(parts[1]),images=int.Parse(parts[2]);
   int expected=Convert.ToInt32(Get(data,"expectedQuestions",0));if(expected>0&&count!=expected)throw new Exception("A contagem de questões mudou. A prova não foi finalizada.");
   if(images!=Convert.ToInt32(Get(sourceInfo,"images",0)))throw new Exception("A contagem de imagens mudou. A prova não foi finalizada.");
   stage="numeração contínua";foreach(dynamic section in doc.Sections){
    foreach(dynamic hf in section.Headers){if(hf.Exists)hf.PageNumbers.RestartNumberingAtSection=false;}
    foreach(dynamic hf in section.Footers){if(hf.Exists)hf.PageNumbers.RestartNumberingAtSection=false;}
   }
   stage="salvar DOCX";doc.SaveAs2(output,12);doc.Close(0);doc=null;word.Quit(0);word=null;
   // Reload and calculate anchor coordinates before saving Word's completed layout.
   stage="conferir documento salvo";word=Activator.CreateInstance(Type.GetTypeFromProgID("Word.Application"));word.Visible=false;doc=word.Documents.Open(output,false,false,false);word.ScreenUpdating=true;doc.Activate();word.ActiveWindow.View.Type=3;doc.Repaginate();
   CompleteLayout(doc);int pages=doc.ComputeStatistics(2),equations=doc.OMaths.Count;doc.Save();
   doc.Close(0);doc=word.Documents.Open(output,false,false,false);word.ActiveWindow.View.Type=3;doc.Repaginate();
   stage="conferência interna de páginas";doc.ExportAsFixedFormat(pdf,17);
   var report=new{ok=true,docx=output,verificationPdf=pdf,questions=count,images=images,equations=equations,pages=pages,macroResult=result,macro="6.3",year=year,pageNumbering="continuous",manualCoverPageBreak=false,generatedAt=DateTime.Now.ToString("o")};
   Write(Path.Combine(folder,stem+".validacao.json"),report);Write(response,report);return 0;
  }catch(Exception e){Write(response,new{ok=false,error=stage+": "+e.Message,detail=e.ToString()});return 1;}
  finally{if(doc!=null)try{doc.Close(0);}catch{}if(previousDoc!=null)try{previousDoc.Activate();}catch{}if(owned&&word!=null)try{word.Quit(0);}catch{}}
 }
}
