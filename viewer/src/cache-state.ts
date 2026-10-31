import JSZip from "jszip";
import { TransferDescriptor } from "threads";
import { registerSerializer } from "threads";
import { Transfer, expose } from "threads/worker";

import { CacheSystem } from "../engine/src/rs/cache/CacheSystem";
import { ConfigType } from "../engine/src/rs/cache/ConfigType";
import { IndexType } from "../engine/src/rs/cache/IndexType";
import {
    CacheLoaderFactory,
    getCacheLoaderFactory,
} from "../engine/src/rs/cache/loader/CacheLoaderFactory";
import { Bzip2 } from "../engine/src/rs/compression/Bzip2";
import { Gzip } from "../engine/src/rs/compression/Gzip";
import { BasTypeLoader } from "../engine/src/rs/config/bastype/BasTypeLoader";
import { LocModelLoader } from "../engine/src/rs/config/loctype/LocModelLoader";
import { LocTypeLoader } from "../engine/src/rs/config/loctype/LocTypeLoader";
import { NpcModelLoader } from "../engine/src/rs/config/npctype/NpcModelLoader";
import { NpcTypeLoader } from "../engine/src/rs/config/npctype/NpcTypeLoader";
import { ObjModelLoader } from "../engine/src/rs/config/objtype/ObjModelLoader";
import { ObjTypeLoader } from "../engine/src/rs/config/objtype/ObjTypeLoader";
import { SeqTypeLoader } from "../engine/src/rs/config/seqtype/SeqTypeLoader";
import { VarManager } from "../engine/src/rs/config/vartype/VarManager";
import { getMapSquareId } from "../engine/src/rs/map/MapFileIndex";
import { MapImageRenderer } from "../engine/src/rs/map/MapImageRenderer";
import { SeqFrameLoader } from "../engine/src/rs/model/seq/SeqFrameLoader";
import { SkeletalSeqLoader } from "../engine/src/rs/model/skeletal/SkeletalSeqLoader";
import { Scene } from "../engine/src/rs/scene/Scene";
import { LocLoadType, SceneBuilder } from "../engine/src/rs/scene/SceneBuilder";
import { IndexedSprite } from "../engine/src/rs/sprite/IndexedSprite";
import { SpriteLoader } from "../engine/src/rs/sprite/SpriteLoader";
import { TextureLoader } from "../engine/src/rs/texture/TextureLoader";
import { Hasher } from "../engine/src/util/Hasher";
import { LoadedCache } from "../engine/src/mapviewer/Caches";
import { NpcSpawn } from "../engine/src/mapviewer/data/npc/NpcSpawn";
import { ObjSpawn } from "../engine/src/mapviewer/data/obj/ObjSpawn";
import { MinimapData, loadMinimapBlob } from "../engine/src/mapviewer/worker/MinimapData";
import { RenderDataLoader, renderDataLoaderSerializer } from "../engine/src/mapviewer/worker/RenderDataLoader";


import type { WorkerState } from "../engine/src/mapviewer/worker/RenderDataWorker";
const compressionPromise=Promise.resolve();const hasherPromise=Hasher.init();
export async function createState(
    cache: LoadedCache,
    objSpawns: ObjSpawn[],
    npcSpawns: NpcSpawn[],
): Promise<WorkerState> {
    await compressionPromise;
    await hasherPromise;

    const cacheSystem = CacheSystem.fromFiles(cache.type, cache.files);

    const loaderFactory = getCacheLoaderFactory(cache.info, cacheSystem);
    const underlayTypeLoader = loaderFactory.getUnderlayTypeLoader();
    const overlayTypeLoader = loaderFactory.getOverlayTypeLoader();

    const varBitTypeLoader = loaderFactory.getVarBitTypeLoader();

    const locTypeLoader = loaderFactory.getLocTypeLoader();
    const objTypeLoader = loaderFactory.getObjTypeLoader();
    const npcTypeLoader = loaderFactory.getNpcTypeLoader();

    const basTypeLoader = loaderFactory.getBasTypeLoader();

    const modelLoader = loaderFactory.getModelLoader();
    const textureLoader = loaderFactory.getTextureLoader();

    const seqTypeLoader = loaderFactory.getSeqTypeLoader();
    const seqFrameLoader = loaderFactory.getSeqFrameLoader();
    const skeletalSeqLoader = loaderFactory.getSkeletalSeqLoader();

    const mapFileLoader = loaderFactory.getMapFileLoader();

    const varManager = new VarManager(varBitTypeLoader);
    const questTypeLoader = loaderFactory.getQuestTypeLoader();
    if (questTypeLoader) {
        varManager.setQuestsCompleted(questTypeLoader);
    }

    const locModelLoader = new LocModelLoader(
        locTypeLoader,
        modelLoader,
        textureLoader,
        seqTypeLoader,
        seqFrameLoader,
        skeletalSeqLoader,
    );

    const objModelLoader = new ObjModelLoader(objTypeLoader, modelLoader, textureLoader);

    const npcModelLoader = new NpcModelLoader(
        npcTypeLoader,
        modelLoader,
        textureLoader,
        seqTypeLoader,
        seqFrameLoader,
        skeletalSeqLoader,
        varManager,
    );

    const sceneBuilder = new SceneBuilder(
        cache.info,
        mapFileLoader,
        underlayTypeLoader,
        overlayTypeLoader,
        locTypeLoader,
        locModelLoader,
        cache.xteas,
    );

    const mapImageRenderer = new MapImageRenderer(
        textureLoader,
        locTypeLoader,
        loaderFactory.getMapScenes(),
        loaderFactory.getMapFunctions(),
    );

    const mapImageCache = await caches.open("map-images");

    return {
        cache,
        cacheSystem,
        cacheLoaderFactory: loaderFactory,

        locTypeLoader,
        objTypeLoader,
        npcTypeLoader,

        seqTypeLoader,
        basTypeLoader,

        textureLoader,
        seqFrameLoader,
        skeletalSeqLoader,

        locModelLoader,
        objModelLoader,
        npcModelLoader,

        sceneBuilder,

        varManager,

        mapImageRenderer,
        mapImageCache,

        objSpawns,
        npcSpawns,
    };
}

