// Workshop placement (BACKLOG 7c, moved from app.ts unchanged): placing a part or a branch with its ghost,
// attachment-node markers and symmetry copies, picking under the pointer, and the canvas pointer handlers.
// app.ts calls wirePlacement at the original place. Calls up into app.ts through app-hooks. The raycaster
// and pointer vector are plain values; no import-time side effects.
import * as T from 'three';
import {attachmentSizeLabel} from './attachment-label.js';
import {PARTS, nodes, nodePoint, nodeAxis, type PartType, type PartAttachment} from './catalog.js';
import type {FlightPart} from './core.js';
import {occupiedNodes, nodeAvailable, assertNodeAttachments, bindMatchingNode} from './attachment-nodes.js';
import {placementSymmetryFrame} from './symmetry.js';
import {symmetryPlacementPoses, surfacePlacementPose, nodePlacementRotation} from './placement-poses.js';
import {placeBranch, moveBranch, type PartBranch} from './assembly-branch.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, $$, disposeMaterial, notify, errorMessage} from './ui-common.js';
import {sceneCore, selectionOverlays, editorMarkers, objects, partObject} from './scene.js';
import {cloneModel} from './part-visuals.js';
import {snapshot, checkpoint} from './workshop-undo.js';
import {partById, clearInterferenceHighlight} from './workshop-panels.js';
import {TouchPlacementTaps, wireTouchGizmoSize} from './touch-placement.js';
const raycaster = new T.Raycaster(),
  mouse = new T.Vector2(),
  touchTaps = new TouchPlacementTaps();
function placementLabel() {
  const label = $('#placement', 'div').firstChild;
  if (!label) throw Error('画面要素が見つかりません: #placement の文言');
  return label;
}
const touchUi = () => document.body.classList.contains('touch');
/** The placement hint: click on the desktop, tap on touch (no key names there). */
function placementHint(subject: string) {
  placementLabel().textContent = touchUi()
    ? subject + ' · 取付位置をタップ'
    : subject + ' · 取付位置をクリック · Escで取消 ';
}
function placementSubject() {
  if (state.branchDraft) return '枝 ' + state.branchDraft.parts.length + ' 部品';
  if (!state.placing) throw Error('配置中の部品がありません');
  return PARTS[state.placing].name;
}
function clearTouchPreview() {
  touchTaps.reset();
  delete $('#placement', 'div').dataset.touchPreview;
}
function disposeMarkers() {
  const {markers} = sceneCore();
  for (const c of markers.children) {
    if (c instanceof T.Mesh) {
      c.geometry.dispose();
      disposeMaterial(c.material);
    }
  }
  markers.clear();
}
export function showNodes() {
  const {markers} = sceneCore();
  disposeMarkers();
  if (!state.placing || $('#attach', 'select').value !== 'node') return;
  const used = occupiedNodes(state.parts.filter(p => !state.movingBranch?.ids.has(p.id)));
  for (const p of state.parts) {
    if (state.movingBranch?.ids.has(p.id)) continue;
    const o = partObject(p.id);
    o.updateWorldMatrix(true, false);
    for (const [index, n] of nodes(p.type).entries()) {
      if (!nodeAvailable(used, p.id, index)) continue;
      const m = new T.Mesh(
        new T.SphereGeometry(0.065, 8, 6),
        new T.MeshBasicMaterial({color: '#a4e4df', transparent: true, opacity: 0.65, depthTest: false})
      );
      m.position.copy(o.localToWorld(new T.Vector3(...nodePoint(n))));
      markers.add(m);
    }
  }
}
export function updatePlacementCopies() {
  const {placementCopies} = selectionOverlays();
  const shape = state.ghost;
  if (!shape || !shape.visible || !state.pendingPose || state.branchDraft) {
    placementCopies.visible = false;
    return;
  }
  if (!state.placing) throw Error('配置中の部品がありません');
  const poses = symmetryPlacementPoses(
    state.pendingPose.pos,
    state.pendingPose.q,
    $('#symmetry', 'select').value,
    state.bayMode,
    state.placing
  );
  for (
    let extra = placementCopies.children.at(-1);
    placementCopies.children.length > poses.length - 1 && extra;
    extra = placementCopies.children.at(-1)
  )
    placementCopies.remove(extra);
  while (placementCopies.children.length < poses.length - 1) placementCopies.add(shape.clone(true));
  placementCopies.visible = true;
  for (let i = 1; i < poses.length; i++) {
    const copy = placementCopies.children[i - 1];
    copy.position.copy(poses[i].pos);
    copy.quaternion.copy(poses[i].q);
    copy.visible = true;
  }
}
export function cancelPlacement() {
  const {scene} = sceneCore();
  const {placementCopies} = selectionOverlays();
  placementCopies.clear();
  placementCopies.visible = false;
  if (state.movingBranch)
    for (const id of state.movingBranch.ids) {
      const obj = objects.get(id);
      if (obj) obj.visible = true;
    }
  state.movingBranch = null;
  state.branchDraft = null;
  $('#symmetry', 'select').disabled = false;
  state.placing = null;
  state.pendingPose = null;
  if (state.ghost) {
    scene.remove(state.ghost);
    state.ghost.traverse(m => {
      if (m instanceof T.Mesh) disposeMaterial(m.material);
    });
    state.ghost = null;
  }
  disposeMarkers();
  clearTouchPreview();
  $('#placement', 'div').hidden = true;
  $$('.partcard', 'button').forEach(b => b.classList.remove('active'));
}
export function beginPlacement(type: PartType, branch: PartBranch | null = null, moving = false) {
  const {scene} = sceneCore();
  const {gizmo} = editorMarkers();
  const {highlight} = selectionOverlays();
  if (state.flight) return;
  clearInterferenceHighlight();
  cancelPlacement();
  state.branchDraft = branch;
  if (moving) {
    if (!branch) throw Error('付け替える枝がありません');
    state.movingBranch = {
      id: branch.rootId,
      ids: new Set(branch.parts.map(p => p.id)),
      before: snapshot(),
      parent: partById(state.parts, branch.rootId).parent || null
    };
    for (const id of state.movingBranch.ids) partObject(id).visible = false;
    highlight.visible = false;
  }
  $('#symmetry', 'select').disabled = !!branch;
  gizmo.detach();
  state.placing = type;
  state.ghost = branch ? branchGhost(branch) : cloneModel(type);
  state.ghost.traverse(o => {
    if (o instanceof T.Mesh) {
      const tint = (m: T.Material) => {
        m = m.clone();
        m.transparent = true;
        m.opacity = 0.5;
        m.depthWrite = false;
        return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
      o.castShadow = false;
    }
  });
  scene.add(state.ghost);
  state.ghost.visible = false;
  $('#placement', 'div').hidden = false;
  placementHint(
    moving && branch
      ? '付け替え ' + branch.parts.length + ' 部品'
      : branch
        ? '枝 ' + branch.parts.length + ' 部品（1組ずつ）'
        : PARTS[type].name
  );
  $$('.partcard', 'button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  showNodes();
}
export function pointer(e: {clientX: number; clientY: number}) {
  const {canvas, camera} = sceneCore();
  const r = canvas.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
}
export function hitPart() {
  const hits = raycaster.intersectObjects(
    [...objects.values()].filter(o => !state.movingBranch?.ids.has(o.userData.partId)),
    true
  );
  for (const h of hits) {
    let o: T.Object3D | null = h.object;
    while (o && !o.userData.partId) o = o.parent;
    if (o) return {...h, id: o.userData.partId, root: o};
  }
  return null;
}
function rejectNodePlacement(message: string) {
  state.pendingPose = null;
  if (!state.ghost) throw Error('配置中の部品がありません');
  state.ghost.visible = false;
  placementLabel().textContent = touchUi() ? message : message + ' · Escで取消 ';
}
function posePlacement(e: PointerEvent) {
  if (!state.placing) return;
  const shape = state.ghost;
  if (!shape) throw Error('配置中の部品がありません');
  pointer(e);
  const hit = hitPart(),
    kind = $('#attach', 'select').value;
  if (state.movingBranch && !hit && (kind === 'node' || kind === 'surface')) {
    state.pendingPose = null;
    shape.visible = false;
    return;
  }
  let pos = new T.Vector3(),
    q = new T.Quaternion(),
    parent = hit?.id ?? null,
    attachment: PartAttachment = {mode: hit && kind === 'surface' ? 'surface' : 'free'};
  const horizontal = state.bayMode === 'sph',
    draft = state.branchDraft;
  if (draft) q.setFromEuler(new T.Euler(...partById(draft.parts, draft.rootId).r));
  else if (horizontal) q.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
  if (hit && kind === 'node') {
    let best = null,
      dist = Infinity;
    const used = occupiedNodes(state.parts.filter(p => !state.movingBranch?.ids.has(p.id)));
    hit.root.updateWorldMatrix(true, false);
    for (const [index, n] of nodes(partById(state.parts, hit.id).type).entries()) {
      if (!nodeAvailable(used, hit.id, index)) continue;
      const pt = hit.root.localToWorld(new T.Vector3(...nodePoint(n))),
        d = pt.distanceTo(hit.point);
      if (d < dist) {
        dist = d;
        best = {
          index,
          point: pt,
          normal: new T.Vector3(...nodeAxis(n)).transformDirection(hit.root.matrixWorld)
        };
      }
    }
    if (!best) {
      rejectNodePlacement('この部品の接続点はすべて使用済みです');
      return;
    }
    const anchor = new T.Vector3(),
      internal = state.branchDraft ? occupiedNodes(state.branchDraft.parts) : new Map();
    let ownNode = -1,
      score = -Infinity;
    q.copy(nodePlacementRotation(state.placing, best.normal, hit.root.quaternion));
    for (const [index, n] of nodes(state.placing).entries()) {
      if (state.branchDraft && !nodeAvailable(internal, state.branchDraft.rootId, index)) continue;
      const normal = new T.Vector3(...nodeAxis(n)).applyQuaternion(q),
        value = normal.dot(best.normal.clone().negate());
      if (value > score) {
        score = value;
        ownNode = index;
        anchor.fromArray(n);
      }
    }
    if (ownNode < 0 || score < 1 - 1e-6) {
      rejectNodePlacement('取出した枝の取付側に空いた接続点がありません');
      return;
    }
    pos.copy(best.point).sub(anchor.applyQuaternion(q));
    attachment = {mode: 'node', parentNode: best.index, ownNode};
  } else if (hit && kind === 'surface') {
    if (!hit.face) throw Error('取付面の向きが分かりません');
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const pose = surfacePlacementPose(state.placing, hit.point, normal);
    q.copy(pose.q);
    pos.copy(pose.pos);
  } else {
    const plane = new T.Plane(new T.Vector3(0, 1, 0), -state.workshopFloor);
    if (!raycaster.ray.intersectPlane(plane, pos)) return;
    pos.y =
      state.workshopFloor +
      (horizontal ? PARTS[state.placing].size[2] / 2 : PARTS[state.placing].size[1] / 2);
    parent = state.movingBranch ? state.movingBranch.parent : state.selected || state.parts[0]?.id || null;
    if ($('#snap', 'input').checked) pos.divideScalar(0.25).round().multiplyScalar(0.25);
    if (state.branchDraft) {
      shape.position.set(0, 0, 0);
      shape.quaternion.copy(q);
      shape.updateMatrixWorld(true);
      pos.y = state.workshopFloor - new T.Box3().setFromObject(shape).min.y;
    }
  }
  shape.position.copy(pos);
  shape.quaternion.copy(q);
  shape.visible = true;
  state.pendingPose = {pos, q, parent, attachment};
  const target = state.parts.find(p => p.id === parent);
  const sizeLabel =
    target &&
    state.placing &&
    attachment.mode === 'node' &&
    attachment.parentNode !== undefined &&
    attachment.ownNode !== undefined
      ? attachmentSizeLabel(target.type, attachment.parentNode, state.placing, attachment.ownNode)
      : '';
  placementHint(placementSubject() + (sizeLabel ? ' · ' + sizeLabel : ''));
}
function place() {
  if (!state.pendingPose) return;
  if (state.branchDraft) {
    try {
      if (state.movingBranch && snapshot() !== state.movingBranch.before)
        throw Error('設計が変更されています。Escで取消してから付け替え直してください');
      const moved = state.movingBranch,
        moving = !!moved,
        rotation = new T.Euler().setFromQuaternion(state.pendingPose.q),
        pose = {
          position: state.pendingPose.pos.toArray(),
          rotation: [rotation.x, rotation.y, rotation.z],
          parent: state.pendingPose.parent,
          attachment: state.pendingPose.attachment
        },
        result = moved
          ? moveBranch(state.parts, moved.id, pose)
          : placeBranch(state.parts, state.branchDraft, pose);
      checkpoint();
      state.parts = result.parts;
      state.selected = result.rootId;
      cancelPlacement();
      hooks.rebuild();
      notify(result.count + '部品の枝を' + (moving ? '付け替えました' : '複製しました'));
    } catch (e) {
      notify(errorMessage(e));
    }
    return;
  }
  const sym = $('#symmetry', 'select').value,
    count = sym === 'mirror' ? 2 : +sym;
  if (state.parts.length + count > 400) {
    notify('部品上限は400です');
    return;
  }
  const type = state.placing;
  if (!type) throw Error('配置中の部品がありません');
  let created: FlightPart[] = [];
  for (const {pos, q} of symmetryPlacementPoses(
    state.pendingPose.pos,
    state.pendingPose.q,
    sym,
    state.bayMode,
    type
  )) {
    const e = new T.Euler().setFromQuaternion(q);
    created.push({
      id: crypto.randomUUID(),
      type,
      p: pos.toArray(),
      r: [e.x, e.y, e.z],
      parent: state.pendingPose.parent,
      stage: 0,
      attachment: structuredClone(state.pendingPose.attachment)
    });
  }
  try {
    if (state.pendingPose.attachment.mode === 'node') {
      created = created.map(p => bindMatchingNode(state.parts, p));
      assertNodeAttachments(
        [...state.parts, ...created],
        created.map(p => p.id)
      );
    }
  } catch (e) {
    notify(errorMessage(e));
    return;
  }
  checkpoint();
  if (count > 1) {
    const group = crypto.randomUUID();
    for (let i = 0; i < created.length; i++) {
      created[i].symmetryGroup = group;
      created[i].symmetryFrame = placementSymmetryFrame(sym, state.bayMode, i, count);
    }
  }
  state.parts.push(...created);
  state.selected = created[0].id;
  hooks.rebuild();
  showNodes();
  notify(`${PARTS[type].name} ×${count} を取り付けました`);
}
/** The attach target of the shown pose for the touch taps: undefined without a pose, null without a node. */
function placementTarget() {
  const pose = state.pendingPose;
  if (!pose) return undefined;
  return pose.attachment.mode === 'node' ? pose.parent + ':' + pose.attachment.parentNode : null;
}
/** A tap while placing on touch: the first tap previews the ghost there, a second tap on it commits. */
function touchPlace(e: PointerEvent) {
  const {camera} = sceneCore();
  camera.updateMatrixWorld();
  const placement = $('#placement', 'div'),
    action = touchTaps.tap(e.clientX, e.clientY, camera.matrixWorld.elements, () => {
      posePlacement(e);
      return placementTarget();
    });
  delete placement.dataset.touchPreview;
  if (action === 'preview') {
    placement.dataset.touchPreview = state.pendingPose?.attachment.mode ?? '';
    placementLabel().textContent = placementSubject() + ' · もう一度タップで確定';
  } else if (action === 'commit') {
    place();
    // Still placing (a single part): hide the ghost until the next preview tap.
    if (state.placing && state.ghost) {
      state.ghost.visible = false;
      state.pendingPose = null;
      clearTouchPreview();
      placementHint(placementSubject());
    }
  }
}
function branchGhost(branch: PartBranch) {
  const group = new T.Group(),
    preview = placeBranch([], branch, {position: [0, 0, 0], rotation: [0, 0, 0]});
  for (const p of preview.parts) {
    const model = cloneModel(p.type);
    model.position.fromArray(p.p);
    model.rotation.set(...p.r);
    group.add(model);
  }
  return group;
}
export function wirePlacement() {
  const {canvas} = sceneCore();
  const {gizmo} = editorMarkers();
  canvas.addEventListener('pointerdown', e => {
    state.pointerDown = {x: e.clientX, y: e.clientY, button: e.button, wasGizmo: !!gizmo.axis};
  });
  wireTouchGizmoSize(gizmo);
  // A finger drag rotates the camera; on touch the ghost moves by taps only (touchPlace).
  canvas.addEventListener('pointermove', e => {
    if (!state.flight && e.pointerType !== 'touch') posePlacement(e);
  });
  canvas.addEventListener('pointerup', e => {
    if (
      !state.pointerDown ||
      state.pointerDown.button !== 0 ||
      Math.hypot(e.clientX - state.pointerDown.x, e.clientY - state.pointerDown.y) > 5 ||
      state.pointerDown.wasGizmo ||
      gizmo.dragging ||
      state.flight
    )
      return;
    if (state.placing) {
      if (e.pointerType === 'touch') {
        touchPlace(e);
        return;
      }
      posePlacement(e);
      place();
    } else {
      pointer(e);
      hooks.select(hitPart()?.id ?? null);
    }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}
