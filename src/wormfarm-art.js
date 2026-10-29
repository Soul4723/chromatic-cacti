// Coordinates are relative to the center of the bed; scale 1 is about 120 px wide.
export function drawWormFarm(ctx, x, y, scale = 1, level = 1, time = 0) {
  ctx.save();
  try {
    ctx.translate(x, y); ctx.scale(scale, scale);
    const poly = (points, fill, stroke = '#452a42', width = 2) => {
      ctx.beginPath(); ctx.moveTo(...points[0]);
      for (const p of points.slice(1)) ctx.lineTo(...p);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke();
    };
    const line = (points, color, width = 2) => {
      ctx.beginPath(); ctx.moveTo(...points[0]);
      for (const p of points.slice(1)) ctx.lineTo(...p);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    };
    const worm = (x, y, color, flip = 1) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(flip, 1);
      ctx.beginPath(); ctx.moveTo(-7, 2); ctx.bezierCurveTo(-3, -6, 0, 6, 5, -1);
      ctx.strokeStyle = '#513044'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#452a42'; ctx.beginPath(); ctx.arc(5, -1, .7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    const bed = (cx, cy, w, d, h) => {
      const top = [[cx-w,cy],[cx,cy-d],[cx+w,cy],[cx,cy+d]];
      poly([[cx-w,cy],[cx,cy+d],[cx,cy+d+h],[cx-w,cy+h]], '#b36a4f');
      poly([[cx,cy+d],[cx+w,cy],[cx+w,cy+h],[cx,cy+d+h]], '#8d4e49');
      poly(top, '#d89a6c');
      poly([[cx-w+6,cy],[cx,cy-d+4],[cx+w-6,cy],[cx,cy+d-4]], '#392b39', '#6a4248', 1);
      line([[cx-w+2,cy+h*.48],[cx,cy+d+h*.48],[cx+w-2,cy+h*.48]], '#704347', 1);
      line([[cx-w+6,cy+h*.2],[cx-4,cy+d+h*.2]], '#e3a67c', 1);
      return top;
    };
    // Soft ground shadow anchors the solid timber faces.
    ctx.fillStyle = 'rgba(46,24,49,.28)'; ctx.beginPath(); ctx.ellipse(2, 24, level === 3 ? 62 : 55, 13, 0, 0, Math.PI*2); ctx.fill();
    if (level >= 3) {
      bed(0, 4, 52, 20, 16);
      worm(-21, 5, '#f48fa8'); worm(12, 11, '#f7cf6d', -1);
      // Posts and a translucent lifted roof leave the nursery visible.
      line([[-43, 3],[-43,-27]], '#704448', 4);
      line([[43, 3],[43,-27]], '#704448', 4);
      poly([[-51,-28],[0,-46],[51,-28],[0,-10]], '#ad96bc');
      poly([[0,-10],[51,-28],[51,-23],[0,-5]], '#786487');
      poly([[-51,-28],[0,-10],[0,-5],[-51,-23]], '#d2b7ce');
      line([[-34,-28],[0,-16],[34,-28]], '#ead7dc', 1.5);
      // Bucket with a readable fertilizer mark.
      poly([[33,19],[48,15],[47,29],[37,32]], '#c78562');
      line([[34,19],[37,11],[46,10],[49,16]], '#ead4a1', 1.7);
      line([[39,23],[43,27],[46,21]], '#c9dc68', 2);
    } else if (level === 2) {
      bed(-20, 3, 31, 15, 13); bed(19, 5, 31, 15, 13);
      worm(-25, 2, '#f48fa8'); worm(15, 6, '#f6d16c', -1);
      // Feed tube, with an open lilac rim and water glint.
      poly([[19,-18],[26,-20],[26,0],[19,2]], '#a4bd6c');
      ctx.fillStyle = '#d3b7d3'; ctx.strokeStyle = '#513448'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(22.5,-19,4.5,2.2,-.15,0,Math.PI*2); ctx.fill(); ctx.stroke();
      line([[21,-13],[21,-3]], '#e2ecae', 1.2);
      ctx.fillStyle = '#d5d7ef'; ctx.beginPath(); ctx.arc(30,-3,2,0,Math.PI*2); ctx.fill();
    } else {
      bed(0, 3, 46, 19, 15);
      worm(-17, 2, '#f48fa8'); worm(10, 8, '#f7cf6d', -1);
      ctx.fillStyle = '#bdce66';
      for (const [a,b] of [[-27,0],[0,-6],[24,1],[-4,10]]) { ctx.beginPath(); ctx.ellipse(a,b,2,1,0,0,Math.PI*2); ctx.fill(); }
    }
  } finally { ctx.restore(); }
}
