// PossessionDebug (?debug only): the possession state machine and every
// player's identity/role, as a text panel (top right).
(function () {
ISO.PossessionDebug = class {
  constructor(possession, roster, scoring, hud) {
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
    this.panel.textContent = lines.join('\n');
  }
};
})();
