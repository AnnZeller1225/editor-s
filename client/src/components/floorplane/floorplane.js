import React, { useRef, useEffect, useState } from "react";
import { connect } from "react-redux";
import { compose } from "../../utils";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import { InteractionManager } from "three.interactive";
import Wall from "../wall";
import { bindActionCreators } from "redux";
import * as actions from "../../actions";
import {
  initScene,
  initPointLight,
  initRenderer,
  findModel,
  isCollision,
  getMouseCoord,
  hideTransformControl,
  replaceModelFromCollision,
  replaceElemFromArr,
  changeVisibility, changeTextureWall,
  getChangeTextureFloor, removeAllHightLight,
  onWindowResize,
  addFloor,
} from "../scripts/initBasicScene.js";
import {
  initCamera,
  cameraControlsEnable, cameraControls, initControls, changeMovingCamera
} from "../scripts/camera.js";
import { initOutlineComposer, composer, outlinePass } from "../scripts/outline";


import io from 'socket.io-client'
const socket = io('http://localhost:7000')

const floorY = 0; // позиция для пола по Y
const scene = new THREE.Scene();
const manager = new THREE.LoadingManager();


let
  cameraPersp,
  renderer,
  checkCollisionModels,
  control,
  gltfLoader,
  updateForAddFurnishingWall,
  updateUseEffectForDrag,
  updateUseEffectForRotate,
  updateUseEffectCameraPanorama,
  updateUseEffectCameraDefault,
  updateUseEffectTexture,
  updateUseEffectTexture__floor,
  updateUseEffectInstrum,
  updateUseEffectListClick,
  updateUseEffectLock,
  clock,
  axesHelper,
  outlinedArr,
  movingStatus,
  needOutline,
  raycaster,
  wallList,// переименовать - для кликов по стенам и полу
  selectedObjects,
  transformControledModel,
  mouse, cameraStatus, fbxLoader, objLoader;

initGlobalLets();
initUseEffects();
// список useEffect, нужен был ранее для отлавливания изменений в сторе и дополнительного перерендера компонента в useEffect 
let dispatchGlobalSelectWall, dispatchGobalSelectSurface, dispatchGlobalResetSelectedModel, dispatchGlobalChangePositionModel, dispatchGlobalSelectModel, dispatchGlobalPercentLoad;

const canvas = renderer.domElement;
let ref;
let checkCollisionWalls = []; // элементы, которые не должны пересекаться при перемещении 

let clickManager = new InteractionManager(
  renderer,
  cameraPersp,
  renderer.domElement
);
let needArrow = true; // флаг для стрелок при перемещении 

let prevChangeVisible = {
  obj: {},
  action: ''
}
/* TODO 
двоится выбор текстур нужно посмотреть ошибку
в selectwall не делать перебор, а отправлять данные на пряямую из  юзердата

добавлять новю генераци. id для новой моддели
resetSelectedModel переименовать в resetSelectedActive - сброс стен и пола тоже
*/


const FloorPlane = ({
  project_1,
  camera,
  dispatchChangePositionModel,
  dispatchSelectWall,
  dispatchSelectModel,
  dispatchSelectSurface,
  dispatchResetNewModel,
  dispatchResetSelectedModel,
  dispatchPercentLoad,
  activeObject,
  modalForConfirm,
  dispatchResetLockModel, activeInList,
}) => {
  cameraStatus = camera.status;
  const { furniture_floor, walls, floor } = project_1;
  ref = useRef();

  /* 
  как раньше работало обновление - делалась проверка на существование в store опред. свойств, если они были, запускался useEffect . функции, начинающиеся с checkUpdate - это проверка, нужно ли это обновление.

  сейчас на socket я проверяю только событие, так что скорее всего множественные useState удалятся из-за ненадобности
  */


  const [addFurnishingsWall, setAddFurnishingsWall] = useState(null);
  const [moveModel, setMoveModel] = useState(null);
  const [rotateModel, setRotateModel] = useState(null);
  const [cameraPanorama, setCameraPanorama] = useState(null);
  const [cameraDefault, setCameraDefault] = useState(null);
  const [changeTexture, setChangeTexture] = useState(null);
  const [changeTextureFloor, setChangeTextureFloor] = useState(null);
  const [resetInstr, setResetInstr] = useState(null);
  const [lockModel, setLockModel] = useState(null);
  const [clickListModel, setClickListModel] = useState(null);


  updateDispatches(); // локальные диспатчеры в глобальные
  // checkUpdateForReplace();

  checkUpdateForAddFurnishingWall();

  checkUpdateForCameraPanorama();
  checkUpdateForCameraDef();
  // checkUpdateTexture__wall();
  // checkUpdateTexture__floor();
  checkUpdateInstrum();
  // checkUpdateDeleteModel();
  checkUpdateForMovingModel(); // эти две функции рендерят компонент дважды
  checkUpdateForRotateModel();
  checkUpdateLockModel();
  // checkUpdateForVisibility();

  checkUpdateClickListModel();


  // отрисовывает сцену,  свет, стенs, пол, моделей
  useEffect(() => {
    main();
    addWalls(walls);
    addFloor(floor, wallList, scene);
    addFurnitureFloor(furniture_floor);

    // нельзя переносить загрузку моделей в другой файл
    // loadFurnishingsWall(furnishingsWall)
    // test()
  }, []);// eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    socket.on('addModel', payload => {
      console.log(' add model')
      loadModel(payload);
    });

  }, []);

  useEffect(() => {

    socket.on('getBright', payload => {
      // addHightLight(payload);
      // console.log('getBright')
      let m = findModel(scene.children, payload)
      // console.log(payload.id, scene.children, 'client')
      addHightLight(m);
    });
  }, []);
  useEffect(() => {

    socket.on('getBrightSurface', payload => {
      // addHightLight(payload);
      // console.log('getBrightSurface')
      let m = findSurface(scene.children, payload)
      // console.log(payload.id, scene.children, 'client')
      addHightLight(m);
    });
  }, []);

  const findWall = (arr, elem) => {
    let wall;
    arr.forEach(el => {
      if (el.userData.type === 'wall' && el.userData.id === elem.id) {
        wall = el
      }
    });
    return wall
  }
  useEffect(() => {

    socket.on('getBrightWall', payload => {
      // addHightLight(payload);
      // console.log('getBrightSurface')
      let m = findWall(scene.children, payload.wall)
      console.log('getBrightWall', m)
      addHightLight(m);
    });
  }, []);

  // добавляем перемещение
  useEffect(() => {
    // socket.on('getAction', payload => {
    //   // addHightLight(payload);
    //   console.log('getAction in client ')
    //   movingStatus = "drag";
    //   showAxesControl(activeObject.action, control);

    // });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  // useEffect(() => {
  //   if (activeObject.action === "drag" && updateUseEffectForDrag) {

  //     movingStatus = "drag";
  //     showAxesControl(activeObject.action, control, activeObject, 'uf drag');
  //     // console.log(' move useEffect ');

  //   }
  // }, [moveModel]);  // eslint-disable-line react-hooks/exhaustive-deps



  useEffect(() => {
    socket.on('deleteModel', payload => {
      deleteModelFromScene(payload);
      // dispatchResetSelectedModel(); // диспатч 

    });

  }, []);
  // видимость 
  useEffect(() => {
    socket.on('changeVisible', payload => {

      let model = changeVisibility(scene.children, payload);
      let updateCheckCollision = [];

      if (!payload.visible) {
        updateCheckCollision = replaceElemFromArr(checkCollisionModels, payload.id);
        checkCollisionModels = updateCheckCollision;
        hideTransformControl(control)
      } else {
        checkCollisionModels.push(model);
        if (payload === activeObject.selectedModel) {
          addTransformControl(model)
        }
      }

    });

  }, []);

  // замена модели
  useEffect(() => {
    socket.on('replaceModel', payload => {
      replaceModelToScene(payload)
    });
    // 
  }, []);

  // замена текстуры 
  useEffect(() => {
    socket.on('changeTexture', payload => {
      getChangeTextureFloor(payload, scene);
    });
    // 
  }, []);


  // если добавляем плоские предметы 
  useEffect(() => {
    if (activeObject.newFurnishings.id && activeObject.isSave && updateForAddFurnishingWall) {
      // loadModel(activeObject.newModel);
      loadNewFurniships(activeObject)
      updateForAddFurnishingWall = false;
      dispatchResetNewModel(); // после загрузки модели сбрасываем выбранну. модели в модалке
      console.log(' фурнитура');
    }

  }, [addFurnishingsWall]);  // eslint-disable-line react-hooks/exhaustive-deps
  function checkUpdateForAddFurnishingWall() {
    if (activeObject.newFurnishings.id && updateForAddFurnishingWall === false && activeObject.isSave && activeObject.typeOfChange === 'add_furnishings_wall') {
      setAddFurnishingsWall(addFurnishingsWall + 1);
      updateForAddFurnishingWall = true;
    }
  }



  // режим камеры - панорама
  useEffect(() => {
    if (camera.status === "panorama") {
      changeMovingCamera(camera.status);
      updateUseEffectCameraPanorama = false;
      // resetCamera(changeStatusCamera);
    }
  }, [cameraPanorama]);  // eslint-disable-line react-hooks/exhaustive-deps

  // режим камеры - по умолчанию 
  useEffect(() => {
    // console.log(" камера по ум");
    if (camera.status === "default" && updateUseEffectCameraDefault) {
      // console.log(" камера по ум");
      updateUseEffectCameraDefault = false;
      changeMovingCamera(camera.status);
      // resetCamera(changeStatusCamera);
      // changeStatusCamera("default");
    }
  }, [cameraDefault]);  // eslint-disable-line react-hooks/exhaustive-deps



  // добавляем вращение
  useEffect(() => {
    if (activeObject.action === "rotate") {
      movingStatus = "rotate";
      showAxesControl(activeObject.action, control,
      );

    }
  }, [rotateModel]);  // eslint-disable-line react-hooks/exhaustive-deps

  // обновление текстуры для стен
  useEffect(() => {
    if (updateUseEffectTexture) {
      // console.log(" меняем текстуру в юз эф   ");
      updateUseEffectTexture = !updateUseEffectTexture;

      changeTextureWall(activeObject.wall, activeObject.newTexture, scene);
      dispatchResetSelectedModel();
    }
  }, [changeTexture]);// eslint-disable-line react-hooks/exhaustive-deps

  // function checkUpdateTexture__wall() {
  //   if (
  //     updateUseEffectTexture === false &&
  //     activeObject.typeOfChange === "change_texture" &&
  //     activeObject.wall.id &&
  //     activeObject.newTexture && activeObject.isSave
  //   ) {
  //     // console.log(' меняем текстуру стены ');
  //     setChangeTexture(changeTexture + 1);
  //     updateUseEffectTexture = true;
  //   }
  // }
  // текстура для пола
  useEffect(() => {
    if (updateUseEffectTexture__floor) {
      updateUseEffectTexture__floor = !updateUseEffectTexture__floor;
      getChangeTextureFloor(activeObject, scene);
      dispatchResetSelectedModel();
    }
  }, [changeTextureFloor]);  // eslint-disable-line react-hooks/exhaustive-deps

  function checkUpdateTexture__floor() {
    // console.log(updateUseEffectTexture__floor, activeObject.typeOfChange, activeObject.surface.id, activeObject.newTexture, activeObject.isSave);
    if (
      updateUseEffectTexture__floor === false && activeObject.typeOfChange === "change_texture" &&
      activeObject.surface.id &&
      activeObject.newTexture && activeObject.isSave
    ) {
      setChangeTextureFloor(changeTextureFloor + 1);
      updateUseEffectTexture__floor = true;
      // console.log(' меняем текструру');
    }
  }



  // сброс стрелок для моделей
  useEffect(() => {
    if (updateUseEffectInstrum) {
      console.log(' cброс всех стрелок UF');
      // movingStatus = null;
      hideTransformControl(control);
      updateUseEffectInstrum = !updateUseEffectInstrum;
      movingStatus = null;
    }
  }, [resetInstr]);  // eslint-disable-line react-hooks/exhaustive-deps



  // если кликнули по списку 
  useEffect(() => {
    const { selectedModel, wall, surface } = activeInList;
    if (
      (activeInList.selectedModel?.id || activeInList.wall?.id || activeInList.surface?.id) &&
      updateUseEffectListClick
    ) {
      console.log('click');
      let active;
      let activeObj;
      if (selectedModel?.id) {
        console.log('active is model');
        active = selectedModel
        activeObj = findModel(scene.children, active);
      } else if (wall?.id) {
        console.log('active is wall');
        active = wall
      } else if (surface?.id) {
        active = surface
        console.log('active is surface');
        activeObj = findSurface(scene.children, active);
      } else {
        console.log(' не нашли тип активного в списке');
      }

      addHightLight(activeObj, 'modelList');
      // debugger;
      updateUseEffectListClick = false;
    }
  }, [clickListModel]);  // eslint-disable-line react-hooks/exhaustive-deps

  function checkUpdateClickListModel() {
    if (
      (activeInList.selectedModel?.id || activeInList.wall?.id || activeInList.surface?.id) &&
      updateUseEffectListClick === false
    ) {

      setClickListModel(clickListModel + 1);
      updateUseEffectListClick = true;
    }
  }

  function findSurface(arr, active) {
    let elem;
    arr.forEach((el) => {
      if (el.type === "Mesh" && el.userData.type === active.type && el.userData.id === active.id) {
        elem = el;
      }
    });
    return elem;
  }

  // блокировка модели
  useEffect(() => {
    if (
      (activeObject.lockModel?.id || activeObject.locking) && updateUseEffectLock
    ) {
      // console.log(' lock UF ');
      updateUseEffectLock = false;

      if (activeObject.lockModel?.id) {
        getChangeLock(activeObject, true);

      } else if (
        activeObject.locking?.id
      ) {

        // console.log(' блокируем не актив ');
        getChangeLock(activeObject, false)
      }
      // диспач сброса блокированной модели в activeObject 
    }
  }, [lockModel]);  // eslint-disable-line react-hooks/exhaustive-deps

  function checkUpdateLockModel() {
    if (
      (activeObject.lockModel?.id || activeObject.locking?.id) &&
      updateUseEffectLock === false
    ) {
      setLockModel(lockModel + 1);
      updateUseEffectLock = true;
    }
  }

  function getChangeLock(activeObject, isActive) {
    //isActive - является ли он активным в сцене или мы кликнули в список, не активируя его, лишь меняя lock
    let model = isActive ?
      findModel(scene.children, activeObject.lockModel) : findModel(scene.children, activeObject.locking);

    model.userData.locked = !model.userData.locked;
    if (isActive) {

      if (activeObject.lockModel.locked) {
        console.log(' блокируем стрелки ');
        hideTransformControl(control);
        dispatchResetLockModel();
      } else {
        console.log('добавим стрелки');
        addTransformControl(model);
        dispatchResetLockModel();
      }
    } else {
      console.log(' блокируем стрелки у не активного');
      // model.userData.locked = true;
      dispatchResetLockModel();
    }
  }







  function updateDispatches() {
    dispatchGlobalSelectWall = dispatchSelectWall; // для передачи локального dispach в addEventListener внешний
    dispatchGobalSelectSurface = dispatchSelectSurface;
    dispatchGlobalChangePositionModel = dispatchChangePositionModel;
    dispatchGlobalSelectModel = dispatchSelectModel;
    dispatchGlobalResetSelectedModel = dispatchResetSelectedModel;
    dispatchGlobalPercentLoad = dispatchPercentLoad
  }








  function checkUpdateForMovingModel() {
    if (
      activeObject.action === "drag" &&
      updateUseEffectForDrag === false && !activeObject.selectedModel.locked

    ) {
      setMoveModel(moveModel + 1);
      updateUseEffectForDrag = true;
      updateUseEffectForRotate = false;
      // if (clicked) {
      //   console.log(' clicked');
      // } else {
      //   setMoveModel(moveModel + 1);
      //   updateUseEffectForDrag = true;
      //   updateUseEffectForRotate = false;
      // }

      // console.log(' is Moving in check');
    }
  }

  function checkUpdateForRotateModel() {
    if (
      activeObject.action === "rotate" &&
      updateUseEffectForRotate === false
    ) {
      setRotateModel(rotateModel + 1);
      updateUseEffectForRotate = true;
      updateUseEffectForDrag = false;
    }
  }

  function checkUpdateForCameraPanorama() {
    if (camera.status === "panorama" && updateUseEffectCameraPanorama === false) {
      setCameraPanorama(cameraPanorama + 1);
      updateUseEffectCameraPanorama = true;
    }
  }

  function checkUpdateForCameraDef() {
    if (camera.status === "default" && updateUseEffectCameraDefault === false) {
      setCameraDefault(cameraDefault + 1);
      updateUseEffectCameraDefault = true;
    }
  }




  function checkUpdateInstrum() {
    if (
      activeObject.action === "reset" &&
      updateUseEffectInstrum === false
    ) {

      setResetInstr(resetInstr + 1);
      updateUseEffectInstrum = true;
    }
  }

  return (

    <>

      <div className="canvas" ref={ref} />

    </>
  );
};

const mapStateToProps = (state) => {

  const { project_1,
    changingModels,
    currentModel,
    addedModel,
    camera,
    modal,
    activeObject,
    modalForConfirm, activeInList,
  } = state.main


  return {
    project_1,
    changingModels,
    currentModel,
    addedModel,
    camera,
    modal,
    activeObject,
    modalForConfirm, activeInList,

  };
};

function mapDispatchToProps(dispatch) {
  return bindActionCreators({
    ...actions,
  }, dispatch);
}

export default compose(connect(mapStateToProps, mapDispatchToProps))(
  FloorPlane
);


function countPercent(loaded, all) {
  // let res = Math.round(loaded / all * 100);
  // dispatchGlobalPercentLoad(res)
}
// отправляет % загрузки модели в store 
manager.onProgress = function (url, itemsLoaded, itemsTotal) {
  countPercent(itemsLoaded, itemsTotal)
};

manager.onError = function (url) {
  console.log('There was an error loading ' + url);
};


// можно перенести 
function addWalls(arr) {
  // тут решить вопрос с правильным поворотом груп - перепутала угол поворота
  // const group = new THREE.Group();
  arr.forEach((wall) => {
    let addedWall = Wall(wall);

    addedWall.userData = {
      ...addedWall.userData,
      id: wall.id,
      name: wall.name,
      type: "wall",
      click: 0,
      outlinePass: true,
    };
    addedWall.material.side = THREE.DoubleSide;
    wallList.push(addedWall);
    checkCollisionWalls.push(addedWall);

    scene.add(addedWall);
  });
}


function addFurnitureFloor(arr) {
  arr.forEach(el => {
    loadModel(el);
  });
}


function getLoader(url) {
  let type = url.match(/\.[0-9a-z]{1,5}$/);
  switch (type[0]) {
    case ".fbx":
      return fbxLoader;
    case ".glb": return gltfLoader;
    case ".gltf": return gltfLoader;
    case ".obj": return objLoader;
    default: return gltfLoader;
  };

}
const getBright_s = (root) => {
  // console.log('click')
  socket.emit('getBright', root);
}
function loadModel(modelJson) {
  const { url, dots, rotate } = modelJson;

  getLoader(url).load(`${url}`, (gltf) => {
    let root = gltf.scene;
    const { x, z } = dots;
    root.rotation.y = rotate;
    root.userData = {
      ...root.userData, ...modelJson,
      click: 0,
    };

    root.position.set(Number(x), Number(floorY), Number(z));
    scene.add(root);
    // выбивало ошибку при удалении моделей, делаем проверку на то, состоит ли в сцене модель
    if (root.parent && root.visible) {
      root.addEventListener("mousedown", () => getBright_s(root.userData));
      // root.addEventListener("mousedown", () => addHightLight(root));
      clickManager.add(root);
      checkCollisionModels.push(root);
      wallList.push(root);
      outlinedArr.push(root);


    }
  }
  );
}
const loadFurnishingsWall = (arr) => {
  arr.forEach(el => {
    load(el)
  });

}


// function isSameModel(prev, next) {
//   if (prev === next) {
//     return true
//   }
// }

// реакция на клик модели => подсветка и transform control
function addHightLight(root, status) {
  if (root?.visible && root.parent && cameraStatus !== 'panorama' && !control.userData.active) {
    root.userData.click += 1;
    highlightModel(root, status);
    // socket.emit('getBright', root);
    // если это модель,  не заблочена и если ей нужны стрелки 
    if (needArrow && !root.userData.locked && (root.userData.type !== "WALL" || root.userData.type !== "FLOOR_SHAPE")) {
      transformControledModel = root;
      addTransformControl(root);
    } else {
      // console.log(' скрываем остальные  стрелки');
      hideTransformControl(control)
    }
  }

}
function addHightLight2(root, status) {
  if (root?.visible && root.parent && cameraStatus !== 'panorama' && !control.userData.active) {
    root.userData.click += 1;
    highlightModel(root, status);
    // если это модель,  не заблочена и если ей нужны стрелки 
    if (needArrow && !root.userData.locked && (root.userData.type !== "WALL" || root.userData.type !== "FLOOR_SHAPE")) {
      transformControledModel = root;
      addTC2(root);
    } else {
      // console.log(' скрываем остальные  стрелки');
      hideTransformControl(control)
    }
  }

}


function deleteModelFromScene(modelLson) {
  let model = findModel(scene.children, modelLson);

  model.material = undefined;
  model.geometry = undefined;

  model.traverse(function (obj) {
    if (obj.type === 'Mesh') {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  })
  model.removeEventListener("click", () => addHightLight(model));
  scene.remove(model);
  checkCollisionModels = replaceModelFromCollision(checkCollisionModels, modelLson.id)
  control.detach();
}


function initUseEffects() {
  updateForAddFurnishingWall = false;
  updateUseEffectForDrag = false;
  updateUseEffectForRotate = false;
  updateUseEffectCameraPanorama = false;
  updateUseEffectCameraDefault = false;
  updateUseEffectTexture = false;
  updateUseEffectTexture__floor = false;
  updateUseEffectInstrum = false;
  updateUseEffectLock = false;
  updateUseEffectListClick = false;
}
function initGlobalLets() {

  cameraPersp = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  cameraPersp.position.set(0, 0, 8);
  raycaster = new THREE.Raycaster(); // считывает пересечения при клике 
  mouse = new THREE.Vector2(); // координаты мыши
  renderer = new THREE.WebGLRenderer({ antialias: true });
  checkCollisionModels = []; // массив всех объектов для пересечения
  control = new TransformControls(cameraPersp, renderer.domElement); //  стрелки моделей
  gltfLoader = new GLTFLoader(manager); // загрузчики моделей и текстур
  fbxLoader = new FBXLoader();
  objLoader = new OBJLoader();
  axesHelper = new THREE.AxesHelper(15); // показывает линии направлений x y z  красная линия - ось x
  scene.add(axesHelper)

  movingStatus = null; // для сброса стрелок при движении 
  clock = new THREE.Clock();
  wallList = []; // список стен доступных для клика
  selectedObjects = []; // для обводки
  outlinedArr = []; // обводка
}

// нельзя переносить
const showAxesControl = (typeOfChange, control) => {
  // console.log(typeOfChange, 'typeOfChange', text, 'text');
  if (typeOfChange === "drag") {
    updateUseEffectForDrag = false;
    control.setMode("translate");
    control.showY = false;
    control.showX = true;
    control.showZ = true;
  } else if (typeOfChange === "rotate") {
    updateUseEffectForRotate = false;
    control.setMode("rotate");
    control.showX = false;
    control.showZ = false;
    control.showY = true;
  } else {
    hideTransformControl(control);
  }
};





function addSelectedObject(object) {
  // для обведения модели
  selectedObjects = [];
  selectedObjects.push(object);
}


// ОСНОВНЫЕ ФУНКЦИИ РАБОТЫ С ОБЪЕКТАМИ
function addTransformControl(model) {

  if (model.parent && !model.userData.locked) {

    model.userData.currentPosition = new THREE.Vector3();
    // реагирует на все изменения 
    control.addEventListener("change", render);

    control.addEventListener("mouseDown", () => {
      control.userData.active = true;
      console.log(' active');
    });
    // при перетягивании
    control.addEventListener(
      "objectChange",
      function (el) {
        isCollision(el, checkCollisionModels);
        el.target.children[0].object.userData.currentPosition.copy(
          el.target.children[0].object.position
        );
      },
      false
    );
    control.addEventListener(
      "dragging-changed",
      (event) => cameraControlsEnable(event, cameraControls),
      false
    );

    control.addEventListener(
      "dragging-changed", () => {
        control.userData.active = false;
        console.log(' dont active');

      }
    );

    control.userData.name = "transformControl";


    scene.add(control);
    showAxesControl(movingStatus, control, 'add TC');
    control.attach(model);

  } else {
    console.log('elem blocked');
    // возмоно понадобится тут удалить стрелки хз как правда
    // showAxesControl(null);
  }

}
// для картин 
function addTC2(model) {
  console.log(' addTC2');
  model.userData.currentPosition = new THREE.Vector3();
  // реагирует на все изменения 
  control.addEventListener("change", render);
  control.addEventListener("mouseDown", () => {
    control.userData.active = true;
  });
  // при перетягивании
  control.addEventListener(
    "objectChange",
    function (el) {
      isCollision(el, checkCollisionModels);
      el.target.children[0].object.userData.currentPosition.copy(
        el.target.children[0].object.position
      );
    },
    false
  );
  control.addEventListener(
    "dragging-changed",
    (event) => cameraControlsEnable(event, cameraControls),
    false
  );

  control.addEventListener(
    "dragging-changed", () => {
      control.userData.active = false;

    }
  );

  control.userData.name = "transformControl";
  control.showX = true;
  control.showZ = false;
  control.showY = true;

  scene.add(control);
  control.attach(model);
}
// отправляет данные в стор 
function sendPosition(event, model) {

  model.userData.click = 2; // после переноса чтобы подсветка могла пропасть
  // console.log(model);
  let { x, y, z } = event.target._plane.object.userData.currentPosition;
  model.userData.dots = event.target._plane.object.userData.currentPosition;
  let modelInfo = {
    dots: { x, y, z },
    rotate: event.target._plane.object.rotation.y,
    id: event.target._plane.object.userData.id,
  };
  dispatchGlobalChangePositionModel(modelInfo);
}
function removeHightLight(model) {
  control.visible = false;
  model.userData.click = 0;

  selectedObjects = [];
  outlinePass.selectedObjects = selectedObjects;
  addSelectedObject(model);
  if (model.userData.type === 'MODEL' || model.userData.type === 'FLOOR_SHAPE') {
    dispatchGlobalResetSelectedModel();
    hideTransformControl(control);
  }
}

function isModel(model) {
  if (model.userData.type === 'MODEL') {
    return true
  }
}
function isSurface(model) {
  if (model.userData.type === 'FLOOR_SHAPE') {
    return true
  }
}
function isSelected(model) {
  if (model.userData.selected) {
    return true
  } else {
    return false
  }
}

// status для modellist чтоб понимать откуда клик 
function highlightModel(model) {
  if (cameraStatus !== 'panorama') {
    // если клик не четный и если модель уже не была выбранна
    if (model.userData.click % 2 > 0 && isSelected(model) === false) {

      if (isModel(model)) {

        dispatchGlobalSelectModel(model.userData);

      } else if (isSurface(model)) {
        dispatchGobalSelectSurface(model.userData.id)

      }
      // debugger;
      removeAllHightLight(scene.children, model);
      // console.log(" добавляем подсветку, удаляя предыдущие ");
      needArrow = true;
      needOutline = true;
      model.userData.selected = true;
      addSelectedObject(model);
      outlinePass.selectedObjects = selectedObjects;

    }
    else if (model.userData.click % 2 === 0 && model.userData.click > 1) {

      if (isModel(model)) {
        dispatchGlobalSelectModel(model.userData);

      }
      else if (isSurface(model)) {
        dispatchGobalSelectSurface(model.userData.id)
      }
      // console.log(" кликнутая модель");
      model.userData.selected = true;
      needOutline = true;
      removeAllHightLight(scene.children, model);
    } else if (isSelected(model)) {
      if (isModel(model)) {
        dispatchGlobalSelectModel(model.userData);
      } else if (isSurface(model)) {
        dispatchGobalSelectSurface(model.userData.id)
      }
      // если повторно кликаем на одну и ту же модель
      // console.log("кликаем на одну и ту же модель");
      needArrow = false;
      needOutline = false;
      removeHightLight(model);
      model.userData.selected = false;
      movingStatus = null; // если нужно оставлять стрелки после снятия выделения - убрать null 
      // dispatchGlobalResetSelectedModel()
    }
  }

}

function loadReplaceableModel(prev, next) {
  const { url, name, id } = next;
  getLoader(url).load(`${url}`, (gltf) => {
    let root = gltf.scene;
    root.userData = {
      ...prev,
      name: name,
      id: id,
      click: 0,
    };
    let { x, z } = prev.dots;
    root.position.set(Number(x), floorY, Number(z));
    scene.add(root);

    root.addEventListener("click", () => addHightLight(root, 'in replace'))

    clickManager.add(root);
    checkCollisionModels.push(root);

    checkCollisionModels = replaceElemFromArr(checkCollisionModels, prev.id);
    wallList.push(root);
    outlinedArr.push(root);

  })
}

function replaceModelToScene(payload) {
  loadReplaceableModel(payload.prev, payload.next); // загружаем новую модель на место старой
  deleteModelFromScene(payload.prev);
  // console.log(' удаляем модель, ', model);
  // dispatchGlobalResetSelectedModel();
}

function load(el, active) {
  const { url, dots } = el

  const { x, y, z } = dots;
  getLoader(url).load(`${url}`,
    (model) => {
      model.scale.set(.01, .01, .01);
      model.position.set(Number(x), Number(y), Number(z));
      model.userData = {
        ...model.userData, ...el,
        click: 0,
      };
      scene.add(model);

      // addTC2(model);
      if (model.parent && model.visible) {
        model.addEventListener("mousedown", () => addHightLight2(model));
        clickManager.add(model);
        checkCollisionModels.push(model);
        wallList.push(model);
        outlinedArr.push(model);
      }
    },

  );
}

function loadNewFurniships(el) {
  const { url } = el.newFurnishings;
  const { x, z, x2, z2 } = el.wall.dots;
  // тут нужно выводить по повороту стены, отправлять это значение в redux при создании стен 
  const y3 = el.wall.height;
  const x3 = x2 - x;
  const z3 = z2 - z;
  getLoader(url).load(`${url}`,
    (model) => {

      model.scale.set(.01, .01, .01);
      model.position.set(Number(x3), Number(y3), Number(z3));
      model.rotation.y = el.wall.rotate;

      model.userData = {
        ...model.userData, ...el,
        click: 0,
      };
      scene.add(model);

      // addTC2(model);
      if (model.parent && model.visible) {
        model.addEventListener("mousedown", () => addHightLight2(model));
        clickManager.add(model);
        checkCollisionModels.push(model);
        wallList.push(model);
        outlinedArr.push(model);
      }
    },

  );
}


//  для клика по стенам и полу
function onClick(event) {
  if (cameraStatus !== 'panorama') {
    getMouseCoord(event, canvas, mouse);

    raycaster.setFromCamera(mouse, cameraPersp);
    var intersects = raycaster.intersectObjects(wallList, true);

    if (intersects.length > 0) {
      let event = intersects[0];

      // isClickForTC(event)
      if (event.object.userData.type === "floor") {
        const root = intersects[0].object;
        let eventId = root.userData.id;
        // console.log(' светим пол ');
        if (!control.userData.active) {
          // root.userData.click += 1;
          // console.log(' светим пол ');
          dispatchGobalSelectSurface(eventId);
          socket.emit("getBrightSurface", root.userData)
          // highlightModel(root, null);
          // needOutline = true;
          // hideTransformControl(control);

        }
      } else if (event.object.userData.type === "wall" && !control.userData.active) {
        let eventObj = intersects[0].object.userData;
        let side = Math.floor(event.faceIndex / 2);
        dispatchGlobalSelectWall(eventObj, side);
        // const root = intersects[0].object;
        // root.userData.click += 1;
        // highlightModel(root, null);
        // hideTransformControl(control)
        let payload = {
          wall: intersects[0].object.userData,
          side: side
        }
        socket.emit("getBrightWall", payload)
      }
      // else if (event.object.type === "MODEL") {
      //   console.log(' в checking click нашел модель ');
      //   // const root = intersects[0].object.children[0];
      //   // root.userData.click += 1;
      //   // highlightModel(root, null);
      // }
    }

  }
}
//  ОБРАБОТЧИКИ СОБЫТИЙ, mouseUp и mouseDown- чтобы не пересекалось с кликом по поверхностям( стоит флаг)

control.addEventListener("mouseUp", (event) => sendPosition(event, transformControledModel));
window.addEventListener("resize", () => onWindowResize(cameraPersp, renderer));
canvas.addEventListener("mousedown", onClick);


// функции только для three js 
function main() {
  init();
  animate();
}
function render() { // не переносится 
  renderer.render(scene, cameraPersp);
}
function init() {
  initRenderer(renderer);
  initScene(scene);
  initCamera(cameraPersp);
  initPointLight(scene);
  initControls(cameraPersp, renderer.domElement);
  initOutlineComposer(scene, cameraPersp, renderer); // для обводки
  ref.current.appendChild(renderer.domElement);
}

function animate() {

  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  const hasControlsUpdated = cameraControls.update(delta);
  clickManager.update();
  // для обводки
  if (hasControlsUpdated) {
    renderer.render(scene, cameraPersp);
    composer.render();
  } else if (needOutline) {
    composer.render();
  } else {
    renderer.render(scene, cameraPersp);
  }
}

export { clickManager, scene };
