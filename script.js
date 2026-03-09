// Scene
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(0x87ceeb);
document.body.appendChild(renderer.domElement);

const keys = {};

document.addEventListener("keydown", (e) => {
  keys[e.key] = true;
});

document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

let car;
const maxForwardSpeed = 0.25;
const maxReverseSpeed = 0.12;
const acceleration = 0.0048;
const reverseAcceleration = 0.0035;
const deceleration = 0.003;
const brakeDeceleration = 0.012;
const steeringSpeed = 0.045;
const steeringSmoothing = 0.14;
let currentSpeed = 0;
let smoothedSteerInput = 0;
const carFrontOffset = Math.PI;
const triggerDistance = 4;
const cameraFollowSpeed = 0.05;
const cameraFollowDistance = 9;
const cameraHeight = 4.5;
const cameraLookAhead = 3;
const junctionLightCycleDuration = 6;
const junctionLights = [];
const junctionSignalHeads = [];
const junctionSignalColliders = [];
const carCollisionRadius = 0.9;

// Lighting for GLB materials
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(8, 12, 6);
scene.add(directionalLight);

const gltfLoader = new THREE.GLTFLoader();
gltfLoader.load(
  "car.glb",
  function (gltf) {
    car = gltf.scene;
    car.scale.set(1, 1, 1);
    car.position.set(0, 0, 0);

    car.traverse((child) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            mat.needsUpdate = true;
          });
        } else {
          child.material.needsUpdate = true;
        }
      }
    });

    scene.add(car);
  },
  undefined,
  function (error) {
    console.error(error);
  }
);

// Ground (land)
const groundMaterial = new THREE.MeshBasicMaterial({
  color: 0x4f7f3f,
  side: THREE.DoubleSide,
});
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  groundMaterial
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

let roadBaseTexture = null;
const textureLoader = new THREE.TextureLoader();
textureLoader.load(
  "./road.jpg",
  (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    if ("colorSpace" in texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else {
      texture.encoding = THREE.sRGBEncoding;
    }

    roadBaseTexture = texture;
    initializeRoadNetwork();
  },
  undefined,
  () => {
    console.warn("road.jpg not found. Using plain road color.");
    initializeRoadNetwork();
  }
);

function addBuildingLabel(text, building, yOffset = 2.6) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 56px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4, 1, 1);
  sprite.position.set(
    building.position.x,
    building.position.y + yOffset,
    building.position.z
  );
  scene.add(sprite);
}

// Projects Building
const projectGeo = new THREE.BoxGeometry(2, 3, 2);
const projectMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const projectsBuilding = new THREE.Mesh(projectGeo, projectMat);
projectsBuilding.position.set(46, 1.5, -34);
scene.add(projectsBuilding);
addBuildingLabel("Projects", projectsBuilding);

// Skills Building
const skillGeo = new THREE.BoxGeometry(2, 3, 2);
const skillMat = new THREE.MeshBasicMaterial({ color: 0x0000ff });
const skillsBuilding = new THREE.Mesh(skillGeo, skillMat);
skillsBuilding.position.set(-48, 1.5, 36);
scene.add(skillsBuilding);
addBuildingLabel("Skills", skillsBuilding);

// Contact Building
const contactGeo = new THREE.BoxGeometry(2, 3, 2);
const contactMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const contactBuilding = new THREE.Mesh(contactGeo, contactMat);
contactBuilding.position.set(30, 1.5, 52);
scene.add(contactBuilding);
addBuildingLabel("Contact", contactBuilding);

function createRoadSegment(from, to, width = 3) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const roadLength = direction.length();
  if (roadLength < 0.001) return;

  const roadGeometry = new THREE.BoxGeometry(width, 0.08, roadLength);
  const materialOptions = { color: 0x222222 };

  if (roadBaseTexture) {
    const segmentTexture = roadBaseTexture.clone();
    segmentTexture.needsUpdate = true;
    segmentTexture.wrapS = THREE.RepeatWrapping;
    segmentTexture.wrapT = THREE.RepeatWrapping;
    segmentTexture.center.set(0.5, 0.5);
    segmentTexture.rotation = Math.PI / 2;
    segmentTexture.repeat.set(1, 1);
    materialOptions.map = segmentTexture;
    materialOptions.color = 0xffffff;
  }

  const roadMaterial = new THREE.MeshBasicMaterial(materialOptions);

  const road = new THREE.Mesh(roadGeometry, roadMaterial);
  road.rotation.y = Math.atan2(direction.x, direction.z);
  road.position.set((from.x + to.x) / 2, 0.04, (from.z + to.z) / 2);
  scene.add(road);
}

function createRoadJoint(point, radius) {
  const jointGeometry = new THREE.CircleGeometry(radius, 24);
  const joint = new THREE.Mesh(
    jointGeometry,
    new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide })
  );
  joint.rotation.x = -Math.PI / 2;
  joint.position.set(point.x, 0.045, point.z);
  scene.add(joint);
}

function createJunctionLight(point, phaseOffset = 0) {
  const signalGroup = new THREE.Group();
  signalGroup.position.set(point.x + 3.2, 0, point.z + 0.8);
  scene.add(signalGroup);
  junctionSignalColliders.push({
    position: new THREE.Vector3(signalGroup.position.x, 0, signalGroup.position.z),
    radius: 0.85,
  });

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 2.4, 10),
    new THREE.MeshPhongMaterial({ color: 0x2b2b2b })
  );
  pole.position.set(0, 1.2, 0);
  signalGroup.add(pole);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.95, 0.28),
    new THREE.MeshPhongMaterial({ color: 0x171717 })
  );
  head.position.set(0, 2.15, 0);
  signalGroup.add(head);

  const bulbColors = [0xff3b30, 0xffd60a, 0x34c759];
  const bulbYOffsets = [0.28, 0, -0.28];
  const bulbs = [];
  const bulbLights = [];

  for (let i = 0; i < bulbColors.length; i++) {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 12),
      new THREE.MeshPhongMaterial({
        color: bulbColors[i],
        emissive: 0x111111,
        shininess: 90,
      })
    );
    bulb.position.set(0, 2.15 + bulbYOffsets[i], 0.15);
    signalGroup.add(bulb);
    bulbs.push(bulb);

    const glow = new THREE.PointLight(bulbColors[i], 0.05, 3.5, 2);
    glow.position.copy(bulb.position);
    signalGroup.add(glow);
    bulbLights.push(glow);
  }

  junctionSignalHeads.push(signalGroup);
  junctionLights.push({
    bulbs,
    bulbLights,
    phaseOffset,
  });
}

function updateJunctionSignalFacing(targetPosition) {
  junctionSignalHeads.forEach((signalGroup) => {
    signalGroup.lookAt(targetPosition.x, signalGroup.position.y, targetPosition.z);
  });
}

function updateJunctionLights(timeSeconds) {
  junctionLights.forEach((lightItem) => {
    const phase =
      ((timeSeconds + lightItem.phaseOffset) % junctionLightCycleDuration) /
      junctionLightCycleDuration;

    let activeIndex = 2; // green
    if (phase < 0.45) {
      activeIndex = 0; // red
    } else if (phase < 0.65) {
      activeIndex = 1; // yellow
    }

    for (let i = 0; i < lightItem.bulbs.length; i++) {
      const isActive = i === activeIndex;
      lightItem.bulbs[i].material.emissive.setHex(isActive ? 0x666666 : 0x111111);
      lightItem.bulbLights[i].intensity = isActive ? 1.15 : 0.05;
    }
  });
}

function canMoveToPosition(nextX, nextZ) {
  for (let i = 0; i < junctionSignalColliders.length; i++) {
    const collider = junctionSignalColliders[i];
    const dx = nextX - collider.position.x;
    const dz = nextZ - collider.position.z;
    const minDistance = carCollisionRadius + collider.radius;
    if (dx * dx + dz * dz < minDistance * minDistance) {
      return false;
    }
  }
  return true;
}

function createRoadNetwork() {
  const projectsPath = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(9, 0, -4),
    new THREE.Vector3(19, 0, -10),
    new THREE.Vector3(30, 0, -18),
    new THREE.Vector3(38, 0, -26),
    new THREE.Vector3(46, 0, -34),
  ];

  const skillsPath = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-9, 0, 4),
    new THREE.Vector3(-19, 0, 11),
    new THREE.Vector3(-30, 0, 20),
    new THREE.Vector3(-39, 0, 28),
    new THREE.Vector3(-48, 0, 36),
  ];

  const contactPath = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(5, 0, 9),
    new THREE.Vector3(12, 0, 20),
    new THREE.Vector3(20, 0, 34),
    new THREE.Vector3(30, 0, 52),
  ];

  const roadWidth = 5;
  const allPaths = [projectsPath, skillsPath, contactPath];

  allPaths.forEach((path) => {
    for (let i = 0; i < path.length - 1; i++) {
      createRoadSegment(path[i], path[i + 1], roadWidth);
    }

    for (let i = 1; i < path.length - 1; i++) {
      createRoadJoint(path[i], roadWidth * 0.5);
    }
  });

  const hubPoint = new THREE.Vector3(0, 0, 0);
  createRoadJoint(hubPoint, roadWidth * 0.58);
  createJunctionLight(hubPoint, 0);
}

let roadNetworkInitialized = false;
function initializeRoadNetwork() {
  if (roadNetworkInitialized) return;
  roadNetworkInitialized = true;
  createRoadNetwork();
}

// Camera position
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  updateJunctionLights(performance.now() * 0.001);

  if (car) {
    updateJunctionSignalFacing(car.position);

    const forwardPressed = keys["ArrowUp"];
    const reversePressed = keys["ArrowDown"];
    const turnLeftPressed = keys["ArrowLeft"];
    const turnRightPressed = keys["ArrowRight"];
    const isBraking = keys[" "];

    if (isBraking) {
      if (currentSpeed > 0) {
        currentSpeed = Math.max(0, currentSpeed - brakeDeceleration);
      } else if (currentSpeed < 0) {
        currentSpeed = Math.min(0, currentSpeed + brakeDeceleration);
      }
    } else if (forwardPressed && !reversePressed) {
      currentSpeed = Math.min(maxForwardSpeed, currentSpeed + acceleration);
    } else if (reversePressed && !forwardPressed) {
      currentSpeed = Math.max(-maxReverseSpeed, currentSpeed - reverseAcceleration);
    } else {
      if (currentSpeed > 0) {
        currentSpeed = Math.max(0, currentSpeed - deceleration);
      } else if (currentSpeed < 0) {
        currentSpeed = Math.min(0, currentSpeed + deceleration);
      }
    }

    if (Math.abs(currentSpeed) > 0.0001) {
      let targetSteerInput = 0;
      if (turnLeftPressed) {
        targetSteerInput -= 1;
      }
      if (turnRightPressed) {
        targetSteerInput += 1;
      }

      smoothedSteerInput +=
        (targetSteerInput - smoothedSteerInput) * steeringSmoothing;

      if (Math.abs(smoothedSteerInput) > 0.001) {
        const reverseSteer = currentSpeed < 0 ? -1 : 1;
        car.rotation.y -=
          smoothedSteerInput * steeringSpeed * reverseSteer;
      }

      const facingAngle = car.rotation.y - carFrontOffset;
      const forwardX = Math.sin(facingAngle);
      const forwardZ = Math.cos(facingAngle);
      const nextX = car.position.x + forwardX * currentSpeed;
      const nextZ = car.position.z + forwardZ * currentSpeed;
      if (canMoveToPosition(nextX, nextZ)) {
        car.position.x = nextX;
        car.position.z = nextZ;
      } else {
        currentSpeed = 0;
      }
    }

    // Smooth camera follow behind the car direction
    const facingAngle = car.rotation.y - carFrontOffset;
    const forwardX = Math.sin(facingAngle);
    const forwardZ = Math.cos(facingAngle);

    const targetCamX = car.position.x - forwardX * cameraFollowDistance;
    const targetCamY = car.position.y + cameraHeight;
    const targetCamZ = car.position.z - forwardZ * cameraFollowDistance;

    camera.position.x += (targetCamX - camera.position.x) * cameraFollowSpeed;
    camera.position.y += (targetCamY - camera.position.y) * cameraFollowSpeed;
    camera.position.z += (targetCamZ - camera.position.z) * cameraFollowSpeed;

    camera.lookAt(
      car.position.x + forwardX * cameraLookAhead,
      car.position.y + 1.2,
      car.position.z + forwardZ * cameraLookAhead
    );

    // Distance check
    const distanceToProjects = car.position.distanceTo(projectsBuilding.position);
    if (distanceToProjects < triggerDistance) {
      document.getElementById("projectsUI").style.display = "block";
    } else {
      document.getElementById("projectsUI").style.display = "none";
    }

    const distanceToSkills = car.position.distanceTo(skillsBuilding.position);
    if (distanceToSkills < triggerDistance) {
      document.getElementById("skillsUI").style.display = "block";
    } else {
      document.getElementById("skillsUI").style.display = "none";
    }

    const distanceToContact = car.position.distanceTo(contactBuilding.position);
    if (distanceToContact < triggerDistance) {
      document.getElementById("contactUI").style.display = "block";
    } else {
      document.getElementById("contactUI").style.display = "none";
    }
  }

  renderer.render(scene, camera);
}

animate();

function closeProjects() {
  document.getElementById("projectsUI").style.display = "none";
}

function closeSkills() {
  document.getElementById("skillsUI").style.display = "none";
}

function closeContact() {
  document.getElementById("contactUI").style.display = "none";
}

window.closeProjects = closeProjects;
window.closeSkills = closeSkills;
window.closeContact = closeContact;
