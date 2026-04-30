import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Upload, Scissors, Download, Film, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

type Status = 'idle' | 'loading' | 'ready' | 'trimming' | 'done' | 'error';

const ffmpeg = new FFmpeg();

function parseSeconds(value: string): number {
  const parts = value.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return [h > 0 ? h : null, m, s]
    .filter((v) => v !== null)
    .map((v) => String(v!).padStart(2, '0'))
    .join(':');
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoURL, setVideoURL] = useState<string>('');
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('00:10');
  const [outputURL, setOutputURL] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFFmpeg = useCallback(async () => {
    if (ffmpeg.loaded) return;
    setStatus('loading');
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  }, []);

  const handleFileChange = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('video/')) {
        setErrorMsg('Please select a valid video file.');
        setStatus('error');
        return;
      }
      setErrorMsg('');
      setOutputURL('');
      setProgress(0);
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoURL(url);
      try {
        await loadFFmpeg();
        setStatus('ready');
      } catch {
        setErrorMsg('Failed to load video processor. Please refresh and try again.');
        setStatus('error');
      }
    },
    [loadFFmpeg]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileChange(file);
    },
    [handleFileChange]
  );

  const handleMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const dur = vid.duration;
    setDuration(dur);
    setStartTime('00:00');
    setEndTime(formatTime(Math.min(dur, 30)));
  };

  const handleTrim = async () => {
    if (!videoFile) return;
    const start = parseSeconds(startTime);
    const end = parseSeconds(endTime);

    if (end <= start) {
      setErrorMsg('End time must be after start time.');
      return;
    }
    if (duration > 0 && start >= duration) {
      setErrorMsg('Start time exceeds video duration.');
      return;
    }

    setErrorMsg('');
    setStatus('trimming');
    setProgress(0);

    const trimDuration = end - start;

    ffmpeg.on('progress', ({ progress: p }) => {
      setProgress(Math.round(p * 100));
    });

    try {
      const ext = videoFile.name.split('.').pop() || 'mp4';
      const inputName = `input.${ext}`;
      const outputName = `output.${ext}`;

      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
      await ffmpeg.exec([
        '-ss', String(start),
        '-i', inputName,
        '-t', String(trimDuration),
        '-c', 'copy',
        outputName,
      ]);

      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([(data as Uint8Array).buffer], { type: videoFile.type });
      const url = URL.createObjectURL(blob);
      setOutputURL(url);
      setStatus('done');
    } catch (err) {
      console.error(err);
      setErrorMsg('Trim failed. Please try a different video or time range.');
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setVideoFile(null);
    setVideoURL('');
    setOutputURL('');
    setStartTime('00:00');
    setEndTime('00:10');
    setProgress(0);
    setErrorMsg('');
    setDuration(0);
  };

  const isBusy = status === 'loading' || status === 'trimming';

  return (
    <div className="min-h-screen bg-[#0f1117] text-gray-100 font-sans">
      <header className="border-b border-white/10 bg-[#0f1117]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <div className="bg-blue-500 rounded-lg p-1.5">
            <Scissors className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">ClipShort Lite</span>
          <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full px-2.5 py-0.5">
            Browser-only
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {(status === 'idle' || status === 'error') && (
          <div
            className="border-2 border-dashed border-white/20 rounded-2xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-500/60 hover:bg-blue-500/5 transition-all duration-200"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="bg-white/5 rounded-full p-5">
              <Upload className="w-9 h-9 text-blue-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white">Drop a video here</p>
              <p className="text-sm text-gray-500 mt-1">or click to browse — MP4, MOV, WebM, AVI</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChange(f);
              }}
            />
          </div>
        )}

        {status === 'loading' && (
          <div className="bg-white/5 rounded-2xl p-8 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
            <p className="text-gray-300 font-medium">Loading video processor...</p>
            <p className="text-sm text-gray-500">This only happens once per session.</p>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{errorMsg}</p>
          </div>
        )}

        {(status === 'ready' || status === 'trimming' || status === 'done') && videoURL && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
              <Film className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{videoFile?.name}</p>
                <p className="text-xs text-gray-500">
                  {videoFile ? (videoFile.size / 1024 / 1024).toFixed(1) + ' MB' : ''}
                  {duration > 0 ? ` · ${formatTime(duration)}` : ''}
                </p>
              </div>
              <button
                onClick={reset}
                className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg"
              >
                Change
              </button>
            </div>

            <div className="rounded-xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                src={videoURL}
                controls
                onLoadedMetadata={handleMetadata}
                className="w-full max-h-64 object-contain"
              />
            </div>

            <div className="bg-white/5 rounded-2xl p-6 space-y-5">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">
                Trim Settings
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-gray-400 font-medium">Start time</label>
                  <input
                    type="text"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    placeholder="mm:ss or hh:mm:ss"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                    disabled={isBusy}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-400 font-medium">End time</label>
                  <input
                    type="text"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    placeholder="mm:ss or hh:mm:ss"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                    disabled={isBusy}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Format: <code className="text-gray-400">mm:ss</code> or{' '}
                <code className="text-gray-400">hh:mm:ss</code>. Example:{' '}
                <code className="text-gray-400">01:30</code> = 1 min 30 sec.
              </p>

              <button
                onClick={handleTrim}
                disabled={isBusy}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {status === 'trimming' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Trimming... {progress > 0 ? `${progress}%` : ''}
                  </>
                ) : (
                  <>
                    <Scissors className="w-4 h-4" />
                    Trim Video
                  </>
                )}
              </button>

              {status === 'trimming' && (
                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>

            {status === 'done' && outputURL && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <h3 className="text-sm font-semibold text-green-300">Clip ready</h3>
                </div>
                <video
                  src={outputURL}
                  controls
                  className="w-full max-h-64 object-contain rounded-lg bg-black"
                />
                <a
                  href={outputURL}
                  download={`clip_${startTime.replace(/:/g, '-')}-${endTime.replace(/:/g, '-')}.${videoFile?.name.split('.').pop() || 'mp4'}`}
                  className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download Clip
                </a>
              </div>
            )}
          </div>
        )}

        {status === 'idle' && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Upload, label: '1. Upload', desc: 'Pick any local video file from your device.' },
              { icon: Scissors, label: '2. Trim', desc: 'Enter start and end times to define your clip.' },
              { icon: Download, label: '3. Download', desc: 'Save the trimmed clip directly to your device.' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="bg-white/5 rounded-xl p-5 space-y-2">
                <div className="bg-blue-500/20 rounded-lg p-2 w-fit">
                  <Icon className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-600">
          All processing happens in your browser. No files are uploaded to any server.
        </p>
      </main>
    </div>
  );
}
