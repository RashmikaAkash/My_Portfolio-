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
document.body.appendChild(renderer.domElement);

const keys = {};

document.addEventListener("keydown", (e) => {
  keys[e.key] = true;
});

document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

let car;
const maxSpeed = 0.22;
const acceleration = 0.004;
const deceleration = 0.003;
const brakeDeceleration = 0.012;
let currentSpeed = 0;
let lastDirX = 0;
let lastDirZ = -1;
const carFrontOffset = Math.PI;
const turnSmoothness = 0.15;
const triggerDistance = 4;
const cameraFollowSpeed = 0.05;

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

// Lighting for GLB materials
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(8, 12, 6);
scene.add(directionalLight);

const loader = new THREE.GLTFLoader();
loader.load(
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

// Ground
const groundGeometry = new THREE.PlaneGeometry(50, 50);
const groundMaterial = new THREE.MeshBasicMaterial({
  color: 0x555555,
  side: THREE.DoubleSide,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = Math.PI / 2;
scene.add(ground);

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
projectsBuilding.position.set(12, 1.5, 0);
scene.add(projectsBuilding);
addBuildingLabel("Projects", projectsBuilding);

// Skills Building
const skillGeo = new THREE.BoxGeometry(2, 3, 2);
const skillMat = new THREE.MeshBasicMaterial({ color: 0x0000ff });
const skillsBuilding = new THREE.Mesh(skillGeo, skillMat);
skillsBuilding.position.set(-12, 1.5, 0);
scene.add(skillsBuilding);
addBuildingLabel("Skills", skillsBuilding);

// Contact Building
const contactGeo = new THREE.BoxGeometry(2, 3, 2);
const contactMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const contactBuilding = new THREE.Mesh(contactGeo, contactMat);
contactBuilding.position.set(0, 1.5, -12);
scene.add(contactBuilding);
addBuildingLabel("Contact", contactBuilding);

// Camera position
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  if (car) {
    let inputX = 0;
    let inputZ = 0;

    // Movement
    if (keys["ArrowUp"]) {
      inputZ -= 1;
    }

    if (keys["ArrowDown"]) {
      inputZ += 1;
    }

    if (keys["ArrowLeft"]) {
      inputX -= 1;
    }

    if (keys["ArrowRight"]) {
      inputX += 1;
    }

    const hasInput = inputX !== 0 || inputZ !== 0;
    const isBraking = keys[" "];

    if (isBraking) {
      currentSpeed = Math.max(0, currentSpeed - brakeDeceleration);
    } else if (hasInput) {
      currentSpeed = Math.min(maxSpeed, currentSpeed + acceleration);
    } else {
      currentSpeed = Math.max(0, currentSpeed - deceleration);
    }

    if (hasInput || currentSpeed > 0) {
      let dirX = lastDirX;
      let dirZ = lastDirZ;

      if (hasInput) {
        const inputLength = Math.hypot(inputX, inputZ) || 1;
        dirX = inputX / inputLength;
        dirZ = inputZ / inputLength;
        lastDirX = dirX;
        lastDirZ = dirZ;
      }

      car.position.x += dirX * currentSpeed;
      car.position.z += dirZ * currentSpeed;

      // Turn front toward movement direction
      const targetRotationY = Math.atan2(dirX, dirZ) + carFrontOffset;
      const angleDiff = normalizeAngle(targetRotationY - car.rotation.y);
      car.rotation.y += angleDiff * turnSmoothness;
    }

    // Smooth camera follow
    camera.position.x += (car.position.x - camera.position.x) * cameraFollowSpeed;
    camera.position.z +=
      (car.position.z + 10 - camera.position.z) * cameraFollowSpeed;
    camera.position.y +=
      (car.position.y + 5 - camera.position.y) * cameraFollowSpeed;
    camera.lookAt(car.position);

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
