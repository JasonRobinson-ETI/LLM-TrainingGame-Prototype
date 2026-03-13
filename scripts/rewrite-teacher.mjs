import { readFileSync, writeFileSync } from 'fs';

// Read the original file (backup)
const original = readFileSync(
  new URL('../src/components/TeacherDashboard.jsx.bak', import.meta.url),
  'utf8'
);

// Extract lines 1-139 (all the logic, hooks, handlers)
const lines = original.split('\n');
// Find the line index of "if (!connected)" - we keep everything before it
const splitIdx = lines.findIndex(l => l.trim() === 'if (!connected) {');
const logicLines = lines.slice(0, splitIdx);

// Inject showQR state after the changingModel state line
const changingModelIdx = logicLines.findIndex(l => l.includes("const [changingModel, setChangingModel] = useState(false);"));
logicLines.splice(changingModelIdx + 1, 0, "  const [showQR, setShowQR] = useState(false);");

const topSection = logicLines.join('\n');

// New JSX section
const newJSX = `
  const students = gameState?.clients
    ? Object.values(gameState.clients).filter(c => c.role === 'student')
    : [];

  const gc = {
    background: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(40px) saturate(180%)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.7)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
    borderRadius: '18px',
  };

  if (!connected) {
    return (
      <div style={{ width: '100vw', height: '100dvh', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0 }}>
        <div style={{ ...gc, textAlign: 'center', padding: '40px' }}>
          <div className="pulse" style={{ fontSize: '3rem', marginBottom: '20px' }}>🔄</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#1d1d1f' }}>Connecting to server...</h2>
        </div>
      </div>
    );
  }

  const modeColor = mode =>
    mode === 'asker'      ? { bg: 'rgba(0,113,227,0.85)',   label: 'Q' } :
    mode === 'answerer'   ? { bg: 'rgba(52,199,89,0.85)',   label: 'A' } :
    mode === 'challenging'? { bg: 'rgba(255,149,0,0.85)',   label: 'C' } :
                            { bg: 'rgba(142,142,147,0.5)',  label: '·' };

  const hdrBtn = (onClick, bg, shadow, label) => (
    <button onClick={onClick} style={{
      background: bg, color: '#fff',
      padding: '6px 14px', fontSize: '12px', fontWeight: '600',
      border: '1px solid rgba(255,255,255,0.7)', borderRadius: '8px',
      cursor: 'pointer', boxShadow: shadow, flexShrink: 0, whiteSpace: 'nowrap',
      transition: 'all 0.2s'
    }}>{label}</button>
  );

  return (
    <div style={{ width: '100vw', height: '100dvh', padding: '8px', margin: '0', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden', position: 'fixed', top: 0, left: 0, gap: '8px' }}>

      {/* ── Compact header bar ── */}
      <div style={{ ...gc, padding: '10px 16px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px', borderRadius: '14px', position: 'relative' }}>

        {/* Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
          <span style={{ fontSize: '18px' }}>🧠</span>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#1d1d1f', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>AI Trainer</span>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />

        {/* Status pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
          padding: '4px 10px', borderRadius: '20px',
          background: gameState?.isActive ? 'rgba(52,199,89,0.12)' : 'rgba(142,142,147,0.12)',
          border: \`1px solid \${gameState?.isActive ? 'rgba(52,199,89,0.35)' : 'rgba(142,142,147,0.3)'}\`,
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: gameState?.isActive ? '#34c759' : '#8e8e93', display: 'block', flexShrink: 0 }} className={gameState?.isActive ? 'pulse' : ''} />
          <span style={{ fontSize: '12px', fontWeight: '600', color: gameState?.isActive ? '#1a7a3a' : '#6e6e73', whiteSpace: 'nowrap' }}>
            {gameState?.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Game buttons */}
        {!gameState?.isActive
          ? hdrBtn(startGame, 'linear-gradient(135deg,rgba(52,199,89,0.85),rgba(48,209,88,0.85))', '0 2px 8px rgba(52,199,89,0.3)', '▶ Start')
          : hdrBtn(endGame,  'linear-gradient(135deg,rgba(255,149,0,0.85),rgba(255,159,10,0.85))', '0 2px 8px rgba(255,149,0,0.3)',  '■ End')}
        {hdrBtn(resetKnowledge, 'linear-gradient(135deg,rgba(255,59,48,0.8),rgba(255,45,85,0.8))', '0 2px 8px rgba(255,59,48,0.25)', '↺ Reset AI')}

        <div style={{ width: '1px', height: '24px', background: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />

        {/* Model selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#86868b', whiteSpace: 'nowrap', flexShrink: 0 }}>MODEL</span>
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            disabled={loadingModels || changingModel}
            style={{
              flex: 1, minWidth: 0,
              background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              color: '#1d1d1f', padding: '5px 10px', fontSize: '12px', fontWeight: '500',
              border: '1px solid rgba(255,255,255,0.7)', borderRadius: '8px',
              cursor: loadingModels || changingModel ? 'not-allowed' : 'pointer',
              opacity: loadingModels || changingModel ? 0.6 : 1,
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)'
            }}
          >
            {loadingModels ? <option>Loading...</option>
              : availableModels.length === 0 ? <option>No models</option>
              : availableModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button
            onClick={changeModel}
            disabled={changingModel || !selectedModel || selectedModel === gameState?.llmModel}
            title="Apply model"
            style={{
              background: changingModel ? 'rgba(142,142,147,0.5)' : 'linear-gradient(135deg,rgba(0,122,255,0.85),rgba(10,132,255,0.85))',
              color: '#fff', padding: '5px 12px', fontSize: '12px', fontWeight: '600',
              border: '1px solid rgba(255,255,255,0.7)', borderRadius: '8px', flexShrink: 0,
              cursor: (changingModel || !selectedModel || selectedModel === gameState?.llmModel) ? 'not-allowed' : 'pointer',
              opacity: (changingModel || !selectedModel || selectedModel === gameState?.llmModel) ? 0.45 : 1,
              transition: 'all 0.2s'
            }}
          >{changingModel ? '⏳' : '✓'}</button>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />

        {/* Student count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#86868b', whiteSpace: 'nowrap' }}>STUDENTS</span>
          <span style={{ padding: '2px 9px', borderRadius: '12px', fontSize: '12px', fontWeight: '700', background: 'rgba(0,122,255,0.12)', color: '#0071e3', border: '1px solid rgba(0,122,255,0.2)' }}>
            {students.length}
          </span>
        </div>

        {/* QR toggle */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowQR(v => !v)}
            title="Show QR code to join"
            style={{
              background: showQR ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.4)',
              border: \`1px solid \${showQR ? 'rgba(0,122,255,0.4)' : 'rgba(255,255,255,0.7)'}\`,
              borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '14px',
              transition: 'all 0.2s', lineHeight: 1
            }}
          >⬛</button>
          {showQR && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 200,
              ...gc, padding: '14px', borderRadius: '14px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.2)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#86868b', marginBottom: '10px', textAlign: 'center', letterSpacing: '0.5px' }}>SCAN TO JOIN</div>
              <QRCodeSVG value={window.location.origin} size={148} level="M" includeMargin={false} />
              <div style={{ fontSize: '11px', color: '#86868b', marginTop: '8px', textAlign: 'center', maxWidth: '148px', wordBreak: 'break-all' }}>
                {window.location.origin}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ display: 'flex', gap: '8px', flex: 1, minHeight: 0 }}>

        {/* LLM Display — large centre pane */}
        <div style={{ flex: '2 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <LLMDisplay gameState={gameState} sendMessage={sendMessage} />
        </div>

        {/* Right sidebar */}
        <div style={{ flex: '0 0 272px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>

          {/* Students card */}
          <div style={{ ...gc, padding: '12px 14px', display: 'flex', flexDirection: 'column', maxHeight: '44%', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexShrink: 0 }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#86868b', letterSpacing: '0.5px' }}>STUDENTS ({students.length})</span>
              <div style={{ display: 'flex', gap: '3px' }}>
                {[['Q','rgba(0,113,227,0.85)'],['A','rgba(52,199,89,0.85)'],['C','rgba(255,149,0,0.85)']].map(([l,b]) => (
                  <span key={l} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '5px', background: b, color: '#fff', fontWeight: '700' }}>{l}</span>
                ))}
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {students.length > 0 ? students.map(client => {
                const m = modeColor(client.currentMode);
                return (
                  <div key={client.id} style={{
                    padding: '6px 10px', background: 'rgba(255,255,255,0.45)', borderRadius: '9px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    border: '1px solid rgba(255,255,255,0.7)', flexShrink: 0
                  }}>
                    <span style={{ fontWeight: '500', color: '#1d1d1f', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '6px' }}>
                      {client.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      <span style={{ width: '22px', height: '22px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', background: m.bg, color: '#fff' }}>
                        {m.label}
                      </span>
                      <button
                        onClick={() => kickStudent(client.id)}
                        title="Kick student"
                        style={{ background: 'rgba(255,59,48,0.7)', border: 'none', borderRadius: '5px', color: '#fff', fontSize: '13px', fontWeight: '700', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,59,48,1)'; e.currentTarget.style.transform = 'scale(1.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,59,48,0.7)'; e.currentTarget.style.transform = 'scale(1)'; }}
                      >×</button>
                    </div>
                  </div>
                );
              }) : (
                <p style={{ color: 'rgba(29,29,31,0.45)', textAlign: 'center', padding: '14px 0', fontSize: '13px' }}>No students connected</p>
              )}
            </div>
          </div>

          {/* Activity log card */}
          <div style={{ ...gc, padding: '12px 14px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#86868b', letterSpacing: '0.5px', marginBottom: '8px', flexShrink: 0 }}>ACTIVITY</div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>

              {/* Starred Q&A pairs */}
              {gameState?.starredQAPairs?.length > 0 && (
                <>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#86868b', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0, marginBottom: '2px' }}>⭐ Starred</div>
                  {gameState.starredQAPairs.slice(0, 3).map(pair => (
                    <div key={pair.id} style={{ padding: '9px 11px', background: 'rgba(255,204,0,0.12)', border: '1px solid rgba(255,204,0,0.3)', borderRadius: '10px', flexShrink: 0 }}>
                      <div style={{ fontSize: '11px', color: '#8B6914', fontWeight: '600', marginBottom: '3px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{pair.studentName}</span><span>⭐</span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: '500', color: '#1d1d1f', marginBottom: '3px', lineHeight: '1.4' }}>Q: {pair.question}</div>
                      <div style={{ fontSize: '12px', color: '#86868b', lineHeight: '1.4', paddingTop: '3px', borderTop: '1px solid rgba(0,0,0,0.07)' }}>A: {pair.answer}</div>
                    </div>
                  ))}
                </>
              )}

              {/* Regular activity */}
              {activityLog.length > 0 ? activityLog.slice(0, 10).map((log, idx) => (
                <div key={idx} style={{ padding: '9px 11px', background: 'rgba(255,255,255,0.42)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: '10px', fontSize: '12px', color: '#1d1d1f', flexShrink: 0, lineHeight: '1.5' }}>
                  {log.type === 'training_data_added' && (
                    <>
                      <div style={{ fontWeight: '500', marginBottom: '2px' }}>Q: {log.data.question.substring(0, 65)}{log.data.question.length > 65 ? '…' : ''}</div>
                      <div style={{ color: '#86868b' }}>A: {log.data.answer.substring(0, 65)}{log.data.answer.length > 65 ? '…' : ''}</div>
                    </>
                  )}
                  {log.type === 'llm_evolved' && <div style={{ fontWeight: '600', color: '#0071e3' }}>🧬 Gen {log.evolutionCount} — {log.personality}</div>}
                  {log.type === 'challenge_failed' && (
                    <>
                      <div style={{ color: '#ff3b30', fontWeight: '600' }}>⚠️ {log.message}</div>
                      {log.corruptedData && <div style={{ color: '#86868b', marginTop: '3px', fontSize: '11px' }}>Q: {log.corruptedData.question}</div>}
                    </>
                  )}
                  {log.type === 'challenge_success' && <div style={{ color: '#34c759', fontWeight: '600' }}>✅ {log.message}</div>}
                  {log.type === 'llm_primed' && (
                    <>
                      <div style={{ fontWeight: '600', color: '#ff9500' }}>🧠 Synced ({log.dataSize} items)</div>
                      {log.thought && <div style={{ color: '#86868b', fontStyle: 'italic', marginTop: '2px', fontSize: '11px' }}>"{log.thought.substring(0, 90)}{log.thought.length > 90 ? '…' : ''}"</div>}
                    </>
                  )}
                </div>
              )) : (
                <p style={{ color: 'rgba(29,29,31,0.45)', textAlign: 'center', padding: '20px 0', fontSize: '13px' }}>No activity yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onClose={() => setShowResetDialog(false)} style={{ position: 'fixed', zIndex: 9999 }}>
        <Transition
          show={showResetDialog}
          enter="transition-opacity duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: 9998 }} aria-hidden="true" />
        </Transition>
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 9999 }}>
          <Transition
            show={showResetDialog}
            enter="transition-all duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="transition-all duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel style={{ ...gc, padding: '32px', borderRadius: '20px', maxWidth: '480px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
              <Dialog.Title style={{ fontSize: '26px', fontWeight: '600', color: '#1d1d1f', marginBottom: '10px', letterSpacing: '-0.02em' }}>
                Reset AI Knowledge?
              </Dialog.Title>
              <Dialog.Description style={{ color: '#86868b', fontSize: '16px', lineHeight: '1.5', marginBottom: '24px' }}>
                This will permanently delete all AI knowledge and training data. This action cannot be undone.
              </Dialog.Description>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowResetDialog(false)}
                  style={{ padding: '10px 22px', fontSize: '14px', fontWeight: '500', border: '1px solid rgba(255,255,255,0.7)', borderRadius: '10px', background: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', color: '#1d1d1f', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.7)'; }}
                  onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.4)'; }}
                >Cancel</button>
                <button
                  onClick={confirmReset}
                  style={{ padding: '10px 22px', fontSize: '14px', fontWeight: '600', border: '1px solid rgba(255,255,255,0.7)', borderRadius: '10px', background: 'linear-gradient(135deg,rgba(255,59,48,0.8),rgba(255,45,85,0.8))', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', color: '#fff', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 16px rgba(255,59,48,0.3)' }}
                  onMouseEnter={e => { e.target.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; }}
                >Reset Everything</button>
              </div>
            </Dialog.Panel>
          </Transition>
        </div>
      </Dialog>
    </div>
  );
};

export default TeacherDashboard;
`;

const newContent = topSection + '\n' + newJSX;
writeFileSync(
  new URL('../src/components/TeacherDashboard.jsx', import.meta.url),
  newContent,
  'utf8'
);
console.log('Written successfully, lines:', newContent.split('\n').length);
