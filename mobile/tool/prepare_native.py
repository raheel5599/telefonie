"""Apply reviewed native audio code and permissions to Flutter-generated projects."""
import pathlib,plistlib,re,shutil,urllib.request,xml.etree.ElementTree as ET
from PIL import Image,ImageOps
ROOT=pathlib.Path(__file__).resolve().parents[1]
assets=ROOT/'assets';assets.mkdir(exist_ok=True)
logo=ROOT.parent/'5C4A17FB-CF3C-455D-9338-1AA5C79A5342.png'
if logo.is_file():shutil.copyfile(logo,assets/'logo.png')
else:
    with urllib.request.urlopen('https://telefonie.tariq-itconsulting.de/logo.png',timeout=20) as r:(assets/'logo.png').write_bytes(r.read())
with Image.open(assets/'logo.png') as source:
    icon=Image.new('RGB',(1024,1024),'#0b0d11');image=ImageOps.contain(source.convert('RGBA'),(930,930));icon.paste(image,((1024-image.width)//2,(1024-image.height)//2),image);icon.save(assets/'icon.png')
(ROOT/'android/app/src/main/kotlin/de/tariqitconsulting/tariq_telefonie/MainActivity.kt').unlink(missing_ok=True)
package=ROOT/'android/app/src/main/kotlin/de/tariqitconsulting/telefonie'
package.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/'native/MainActivity.kt',package/'MainActivity.kt')
manifest=ROOT/'android/app/src/main/AndroidManifest.xml';ns='http://schemas.android.com/apk/res/android';ET.register_namespace('android',ns);tree=ET.parse(manifest);doc=tree.getroot()
for name in ['android.permission.INTERNET','android.permission.RECORD_AUDIO','android.permission.MODIFY_AUDIO_SETTINGS','android.permission.ACCESS_NETWORK_STATE','android.permission.CHANGE_NETWORK_STATE']:
    if not any(x.get('{'+ns+'}name')==name for x in doc.findall('uses-permission')):ET.SubElement(doc,'uses-permission',{'{'+ns+'}name':name})
application=doc.find('application');application.set('{'+ns+'}label','TARIQ Telefonie');application.set('{'+ns+'}allowBackup','false');application.set('{'+ns+'}usesCleartextTraffic','false');tree.write(manifest,encoding='utf-8',xml_declaration=True)
gradle=ROOT/'android/app/build.gradle.kts'
if gradle.is_file():gradle.write_text(gradle.read_text().replace('minSdk = flutter.minSdkVersion','minSdk = 24').replace('de.tariqitconsulting.tariq_telefonie','de.tariqitconsulting.telefonie'))
project=ROOT/'ios/Runner.xcodeproj/project.pbxproj'
source=project.read_text();source=re.sub(r'PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);',lambda m:'PRODUCT_BUNDLE_IDENTIFIER = de.tariqitconsulting.telefonie'+('.RunnerTests' if 'RunnerTests' in m[1] else '')+';',source);project.write_text(source)
info=ROOT/'ios/Runner/Info.plist'
with info.open('rb') as f:settings=plistlib.load(f)
settings['CFBundleDisplayName']='TARIQ Telefonie';settings['NSMicrophoneUsageDescription']='TARIQ Telefonie benötigt das Mikrofon für deine Telefonate.'
settings['UIBackgroundModes']=['audio']
with info.open('wb') as f:plistlib.dump(settings,f)
appdelegate=ROOT/'ios/Runner/AppDelegate.swift';source=appdelegate.read_text()
if 'TariqAudioPlugin.register' not in source:
    match=re.search(r'GeneratedPluginRegistrant\.register\(with: ([^)]+)\)',source)
    if not match:raise ValueError('Flutter plugin registration not found')
    registry=match[1];source=source[:match.end()]+f'\n    TariqAudioPlugin.register(with: {registry}.registrar(forPlugin: "TariqAudioPlugin")!)'+source[match.end():]
    # Legacy app delegate uses registrar directly; modern Flutter uses the engine registry.
    source=source.replace('self.registrar(forPlugin:', 'self.registrar(forPlugin:')
    source+='\n'+(ROOT/'native/TariqAudio.swift').read_text();appdelegate.write_text(source)
(ROOT/'test/widget_test.dart').unlink(missing_ok=True)
print('Native audio, microphone permission, TLS-only transport and TARIQ branding prepared.')

# WebRTC native bindings must survive release shrinking.
rules=ROOT/'android/app/proguard-rules.pro'
with rules.open('a') as f:f.write('\n-keep class com.cloudwebrtc.webrtc.** { *; }\n-keep class org.webrtc.** { *; }\n')
if gradle.is_file():
    s=gradle.read_text()
    if 'proguard-rules.pro' not in s:
        s=s.replace('buildTypes {','buildTypes {\n        getByName("release") {\n            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")\n        }')
        gradle.write_text(s)
