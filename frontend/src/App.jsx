import { useState } from 'react'

const classificationLabels = {
  project_demo: 'Project demo',
  other: 'No project demo detected',
  uncertain: 'Project type unclear',
}

export default function App() {
  const [mode, setMode] = useState('link')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [video, setVideo] = useState(null)
  const [playbackError, setPlaybackError] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [roadmap, setRoadmap] = useState(null)
  const [planning, setPlanning] = useState(false)
  const [roadmapError, setRoadmapError] = useState('')
  const working = busy || analyzing || planning

  function changeMode(next) {
    setMode(next)
    setError('')
  }

  async function importVideo(event) {
    event.preventDefault()
    if (working) return
    setError('')
    if (mode === 'upload' && (!file || file.size > 50 * 1024 * 1024)) {
      setError(file ? 'Choose an MP4 smaller than 50 MB.' : 'Choose an MP4 to upload.')
      return
    }
    setBusy(true)
    try {
      let body
      if (mode === 'upload') {
        const form = new FormData()
        form.append('file', file)
        body = form
      } else {
        body = JSON.stringify({ url })
      }
      const response = await fetch(`/api/videos/${mode === 'link' ? 'reel' : 'upload'}`, {
        method: 'POST',
        headers: mode === 'link' ? { 'Content-Type': 'application/json' } : undefined,
        body,
        signal: AbortSignal.timeout(95000),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(typeof result.detail === 'string' ? result.detail : 'Please check your input and try again.')
      }
      setVideo(result)
      setPlaybackError(false)
      setAnalysis(null)
      setAnalysisError('')
      setRoadmap(null)
      setRoadmapError('')
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === 'TimeoutError'
        ? 'This is taking too long. Try uploading the MP4.'
        : caught instanceof TypeError || caught instanceof SyntaxError
          ? 'Could not reach the video service. Check that the backend is running.'
          : caught instanceof Error ? caught.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function analyzeImportedVideo() {
    if (!video || analysis || working) return
    setAnalyzing(true)
    setAnalysisError('')
    try {
      const response = await fetch('/api/videos/' + video.id + '/analysis', {
        method: 'POST',
        signal: AbortSignal.timeout(165000),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Video analysis failed.')
      setAnalysis(result)
      setRoadmap(null)
      setRoadmapError('')
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'TimeoutError') {
        setAnalysisError('Analysis timed out. Try again.')
      } else if (caught instanceof TypeError || caught instanceof SyntaxError) {
        setAnalysisError('Could not reach the video analysis service.')
      } else {
        setAnalysisError(caught instanceof Error ? caught.message : 'Video analysis failed.')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  async function generateBuildRoadmap() {
    if (!video || analysis?.classification !== 'project_demo' || roadmap || working) return
    setPlanning(true)
    setRoadmapError('')
    try {
      const response = await fetch('/api/videos/' + video.id + '/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analysis),
        signal: AbortSignal.timeout(75000),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(typeof result.detail === 'string' ? result.detail : 'Could not generate the roadmap.')
      }
      setRoadmap(result)
    } catch (caught) {
      const timedOut = caught instanceof DOMException && caught.name === 'TimeoutError'
      setRoadmapError(timedOut ? 'Roadmap generation timed out. Try again.' : caught.message || 'Could not generate the roadmap.')
    } finally {
      setPlanning(false)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <a className="brand" href="/" aria-label="Reel2Build home">
          <span className="brand-mark" aria-hidden="true">↗</span> reel<span>2</span>build
        </a>
        <span className="header-note">FROM SAVED REEL TO NEXT BUILD</span>
      </header>

      <main>
        <div className="intro">
          <p className="eyebrow">A LITTLE INSPIRATION. A REAL START.</p>
          <h1>That thing you saved?<br /><span>Start building it.</span></h1>
          <p className="intro-copy">Bring a video of a project you want to make.<br className="desktop-break" /> First, let’s get a good look at it.</p>
        </div>

        <div className="workspace">
          <section className="import-panel" aria-labelledby="import-heading">
            <div className="section-label"><span className="step">01</span> YOUR INSPIRATION</div>
            <h2 id="import-heading">Bring your project video</h2>
            <p className="muted">A quick demo is a great place to start.</p>

            <div className="mode-switch" role="group" aria-label="Video source">
              <button type="button" aria-pressed={mode === 'link'} disabled={working} onClick={() => changeMode('link')}>Instagram link</button>
              <button type="button" aria-pressed={mode === 'upload'} disabled={working} onClick={() => changeMode('upload')}>Upload video</button>
            </div>

            <form onSubmit={importVideo}>
              <fieldset disabled={working}>
                {mode === 'link' ? (
                  <div className="input-block">
                    <label htmlFor="reel-url">Public Reel URL</label>
                    <input id="reel-url" type="url" required maxLength={2048} placeholder="https://www.instagram.com/reel/…" value={url} onChange={event => setUrl(event.target.value)} aria-describedby="source-help" />
                    <p id="source-help" className="helper">Copy the link from Instagram. No login needed.</p>
                  </div>
                ) : (
                  <div className="input-block">
                    <label htmlFor="video-file">Choose your MP4</label>
                    <input id="video-file" type="file" accept="video/mp4,.mp4" required onChange={event => setFile(event.target.files?.[0] ?? null)} aria-describedby="source-help" />
                    <p id="source-help" className="helper">Up to 50 MB and 3 minutes. Pick a clear project demo.</p>
                  </div>
                )}
                <button className="primary" type="submit">
                  {busy ? <><span className="spinner" aria-hidden="true" />{mode === 'link' ? 'Retrieving your Reel…' : 'Uploading your video…'}</> : <>Import video <span aria-hidden="true">↗</span></>}
                </button>
              </fieldset>
              {error ? <p className="error" role="alert">{error}</p> : null}
              <p className="progress-text" role="status" aria-live="polite">{busy ? 'This can take up to 90 seconds. Keep this page open.' : ''}</p>
            </form>

            <div className="source-note"><span aria-hidden="true">ⓘ</span><p>Some Reels aren’t accessible by link. If yours won’t load, switch to an MP4 upload.</p></div>
          </section>

          <section className={`preview-panel ${video ? 'has-video' : ''}`} aria-labelledby="preview-heading" aria-busy={busy}>
            <div className="preview-top"><span id="preview-heading">YOUR VIDEO</span><span className={`preview-status ${video ? 'ready' : ''}`}>{video ? 'Imported' : 'Awaiting inspiration'}</span></div>
            {video ? (
              <>
                <div className="video-stage"><video key={video.id} controls playsInline preload="metadata" src={video.url} aria-label="Imported project video" onError={() => setPlaybackError(true)} /></div>
                <div className="video-info">
                  <h3>{video.filename}</h3>
                  <div className="metadata"><span>{Math.round(video.duration_seconds)} seconds</span><span>{(video.bytes / 1024 / 1024).toFixed(1)} MB</span><span>{video.has_audio ? 'Audio included' : 'No audio stream'}</span></div>
                  {playbackError ? <p className="error" role="alert">Your browser couldn’t play this video. Try an MP4 encoded with H.264.</p> : null}
                  <button className="primary" type="button" disabled={working || Boolean(analysis)} onClick={analyzeImportedVideo}>
                    {analyzing ? 'Analyzing video…' : analysis ? 'Analysis complete' : 'Analyze video'}
                  </button>
                  <p className="helper">A new analysis uses up to two requests for frames and audio. Completed analyses are reused for the same video.</p>
                  {analyzing ? <p className="helper" role="status">Preparing the video and waiting for analysis.</p> : null}
                  {analysisError ? <p className="error" role="alert">{analysisError}</p> : null}
                </div>
              </>
            ) : (
              <div className="empty-preview"><div className="frame-icon" aria-hidden="true"><span>▶</span></div><h3>A spark goes here.</h3><p>Import a Reel or upload a video.<br />You’ll be able to watch it right here.</p></div>
            )}
          </section>
        </div>

        {analysis ? (
          <section className="import-panel analysis-panel" aria-labelledby="analysis-heading" aria-live="polite">
            <div className="section-label"><span className="step">02</span> VIDEO ANALYSIS</div>
            <h2 id="analysis-heading">{classificationLabels[analysis.classification]}</h2>
            <p>{analysis.summary}</p>
            {analysis.observations.length ? (
              <>
                <h3>What’s visible</h3>
                <ul>
                  {analysis.observations.map((observation, index) => (
                    <li key={index}>
                      <strong>{analysis.frame_timestamps[observation.frame - 1].toFixed(1)}s</strong>
                      {' '}{observation.detail}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {analysis.uncertainties.length ? (
              <>
                <h3>What’s unclear</h3>
                <ul>{analysis.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </>
            ) : null}
            {analysis.transcript ? (
              <details>
                <summary>Speech transcript</summary>
                <p>{analysis.transcript}</p>
              </details>
            ) : null}
            {analysis.transcription_status === 'no_speech' ? <p className="helper">No speech was transcribed.</p> : null}
            {analysis.transcription_status === 'unavailable' ? <p className="helper">Speech transcription was unavailable. This result uses sampled frames.</p> : null}
            {analysis.classification === 'project_demo' ? (
              <div className="input-block">
                <button className="primary" type="button" disabled={working || Boolean(roadmap)} onClick={generateBuildRoadmap}>
                  {planning ? 'Generating roadmap…' : roadmap ? 'Roadmap complete' : 'Generate build roadmap'}
                </button>
                {!roadmap ? <p className="helper">A new roadmap uses one model request.</p> : null}
                {planning ? <p className="helper" role="status">Building a plan from the video analysis.</p> : null}
                {roadmapError ? <p className="error" role="alert">{roadmapError}</p> : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {roadmap ? (
          <section className="import-panel analysis-panel" aria-labelledby="roadmap-heading" aria-live="polite">
            <div className="section-label"><span className="step">03</span> BUILD ROADMAP</div>
            <h2 id="roadmap-heading">{roadmap.title}</h2>
            <p>{roadmap.goal}</p>
            {roadmap.assumptions.length ? (
              <>
                <h3>Assumptions to check</h3>
                <ul>{roadmap.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </>
            ) : null}
            <h3>Build steps</h3>
            <ol>
              {roadmap.steps.map((step, index) => (
                <li key={index}>
                  <strong>{step.title}</strong>
                  <div>{step.action}</div>
                  <div><strong>Check</strong> {step.check}</div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </main>
      <footer><span>Reel2Build</span><span>Less saving for later. More making it happen.</span></footer>
    </div>
  )
}
