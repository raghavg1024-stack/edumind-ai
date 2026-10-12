$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$sampleWork = Join-Path $PSScriptRoot '../../../work/lecture-sample'
$samplePublic = Join-Path $PSScriptRoot '../public/samples'
New-Item -ItemType Directory -Force -Path $sampleWork,$samplePublic | Out-Null
$sentences = @('Photosynthesis converts light energy into chemical energy stored in glucose.','Chlorophyll absorbs light in the chloroplasts. The light dependent reactions release oxygen.','The Calvin cycle fixes carbon dioxide into sugars. It uses ATP and NADPH.')
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = -1
$start = 0.0
$vtt = "WEBVTT`n`n"
$concat = @()
function Cue-Time([double]$value) { [TimeSpan]::FromSeconds($value).ToString('hh\:mm\:ss\.fff') }
try {
 for ($i=0; $i -lt $sentences.Count; $i++) {
  $wave = Join-Path $sampleWork "speech-$i.wav"
  $synth.SetOutputToWaveFile($wave)
  $synth.Speak($sentences[$i])
  $synth.SetOutputToNull()
  $duration = [double](& ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $wave)
  $vtt += "$(Cue-Time $start) --> $(Cue-Time ($start+$duration))`n$($sentences[$i])`n`n"
  $concat += "file '$($wave.Replace('\','/'))'"
  $start += $duration
 }
} finally { $synth.Dispose() }
$concatFile = Join-Path $sampleWork 'concat.txt'
$concat | Set-Content -LiteralPath $concatFile -Encoding ascii
$audio = Join-Path $sampleWork 'lecture.wav'
& ffmpeg -y -v error -f concat -safe 0 -i $concatFile -ac 1 -ar 16000 $audio
if ($LASTEXITCODE -ne 0) { throw 'Audio concatenation failed.' }
$output = Join-Path $samplePublic 'photosynthesis.mp4'
& ffmpeg -y -v error -f lavfi -i "color=c=0x234e3d:s=640x360:r=24" -i $audio -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 64k -shortest -movflags +faststart $output
if ($LASTEXITCODE -ne 0) { throw 'Sample MP4 creation failed.' }
$vtt | Set-Content -LiteralPath (Join-Path $samplePublic 'photosynthesis.vtt') -Encoding utf8
Write-Output "Created a $([Math]::Round($start,2))-second lecture with known synthetic speech and authored captions."

