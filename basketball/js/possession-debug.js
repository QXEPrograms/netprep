// PossessionDebug (?debug only): the possession state machine and every
// player's identity/role, as a text panel (top right).
(function () {
ISO.PossessionDebug = class {
  constructor(possession, roster, scoring, hud, game = null) {
    this.game = game;
    this.P = possession;
    this.roster = roster;
    this.scoring = scoring;
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'absolute', right: '12px', top: '70px', padding: '8px 10px', borderRadius: '8px',
      background: 'rgba(8,12,22,0.78)', color: '#e8ecf4', font: '11px/1.45 Menlo, Consolas, monospace',
      whiteSpace: 'pre', pointerEvents: 'none', zIndex: 5,
    });
    hud.appendChild(this.panel);
  }

  update() {
    const s = this.P.snapshot(), sc = this.scoring;
    const asg = Object.entries(s.assignments).map(([d, o]) => `${d}->${o}`).join(' ') || '-';
    const lines = [
      `POSSESSION #${s.possessionNumber}  ${s.possessionState}  t ${s.timer.toFixed(2)}${s.fade > 0 ? '  fade ' + s.fade.toFixed(2) : ''}`,
      `offense ${s.offenseTeamId}   defense ${s.defenseTeamId || '-'}   score ${Object.entries(sc.teamScore).map(([t, v]) => t + ' ' + v).join(' : ')}`,
      `ball owner ${s.ballOwnerPlayerId || 'null'}   handler ${s.ballHandlerPlayerId}   guards ${asg}`,
      `last shot #${s.lastShotId || '-'} ${s.lastShotResult || '-'}   started by ${s.possessionStartReason || '-'}   last change ${s.lastPossessionChangeReason || '-'} (prev ${s.lastPossessionTeamId || '-'})`,
    ];
    if (s.shot) lines.push(`IN FLIGHT #${s.shot.shotId} by ${s.shot.shooterPlayerId} (${s.shot.shootingTeamId}) ${s.shot.shotType}  blocked ${s.shot.wasBlocked ? 'yes by ' + s.shot.blockerPlayerId : 'no'}`);
    if (s.lastBlockPlayerId) lines.push(`last block ${s.lastBlockPlayerId} (${s.lastBlockTeamId})`);
    for (const p of this.roster.players) {
      const ctl = p.role === 'offense' ? 'OffensiveLocomotion' : 'DefensiveLocomotion';
      const who = p.role === 'offense' ? `vs ${p.matchupId || '-'}` : `guards ${p.assignmentId || '-'}`;
      lines.push(`${p.id} team ${p.teamId} ${p.controlSource.padEnd(5)} ${(p.role || '-').padEnd(7)} ${ctl} ${who}${p.isBallHandler ? '  [ball]' : ''}`);
    }
    // Reference-match line: the matchup as one system.
    const g = this.game;
    if (g && g.defender) {
      const o = g.player, d = g.defender, L = o.locomotion, DL = d.locomotion, dr = o.dribble;
      const gap = Math.hypot(o.position.x - d.position.x, o.position.z - d.position.z);
      const cam = g.cameraController, f = cam.current;
      const sh = o.shooting, fi = o.finishing;
      const shot = sh.busy ? (sh.isPumpFaking ? 'pump fake' : `${sh.shotType} ${sh.shotPhase || ''}`) : fi.busy ? `${fi.finishType} ${fi.finishPhase || ''}` : '-';
      lines.push(`REF  gap ${gap.toFixed(2)} m   commit ${(L.attack || 0).toFixed(2)} ${L.level || ''}   plant ${L.plantState || '-'}   dribble ${dr.hand[0].toUpperCase()} phase ${dr.phase.toFixed(2)}`);
      lines.push(`     defender ${d.state}  react ${(d.ai.reactionDelay * 1000).toFixed(0)} ms  facing err ${(Math.abs(DL.defensiveFacingError) * 57.3).toFixed(0)}°  ${DL.mode}  jump ${DL.jumpState}`);
      lines.push(`     shot ${shot}  contest ${d.contest.contestStrength.toFixed(2)}  blocks live ${d.blocks.active ? 'yes' : 'no'}   cam focus (${f.x.toFixed(1)}, ${f.z.toFixed(1)}) yaw ${(cam.yaw * 57.3).toFixed(0)}°`);
    }
    this.panel.textContent = lines.join('\n');
  }
};
})();
