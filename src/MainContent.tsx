import { LocalAudioStream, LocalDataStream, LocalP2PRoomMember, LocalStream, LocalVideoStream, nowInSec, RemoteDataStream, RoomPublication, SkyWayAuthToken, SkyWayContext, SkyWayRoom, SkyWayStreamFactory, uuidV4 } from "@skyway-sdk/room";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RemoteMedia } from "./RemoteMedia";
import "./MainContent.css"
import { FaceMesh, Results } from '@mediapipe/face_mesh';
import { Camera } from "@mediapipe/camera_utils";
import Webcam from "react-webcam";

interface WindowInfo {
    top: number;
    left: number;
    width: number;
    screenWidth: number;
    screenHeight: number;
    scrollX: number;
    scrollY: number;
}

// 数値型リストの要素の平均値を求める関数
function Average_value(number_list: number[], start_id: number = 0, end_id: number = number_list.length - 1) {
  let sum = 0;  // 引数のリスト内の要素の合計値
  for (let i = start_id; i < end_id + 1; i++) {
    sum += number_list[i];
  }
  return sum / (end_id - start_id + 1);
}

// ベクトル（数値型リスト）のリストの平均ベクトルを求める関数
// function Average_vector(number_list: number[][], start_id: number = 0, end_id: number = number_list.length - 1) {
//   let sum = [0,0];  // 引数のリスト内の要素の合計値
//   for (let i = start_id; i < end_id + 1; i++) {
//     sum[0] += number_list[i][0];
//     sum[1] += number_list[i][1];
//   }
//   return [sum[0] / (end_id - start_id + 1), sum[1] / (end_id - start_id + 1)];
// }

// 2つのベクトル（数値型リスト）の内積を求める関数
function Inner(number_list1: number[], number_list2: number[]) {
  return number_list1[0] * number_list2[0] + number_list1[1] * number_list2[1];
}

// ベクトル（数値型リスト）の長さを求める関数
function Norm(number_list: number[]) {
  return Math.sqrt(number_list[0] * number_list[0] + number_list[1] * number_list[1]);
}

// 移動平均計算時のフレーム数
const MovingAverage_frame = 20;
// 移動平均計算用の配列
let move_top_positions: number[][] = [[],[]];
let move_left_positions: number[][] = [[],[]];
let move_width: number[][] = [[],[]];

// 条件ID（1: Baseline, 2: PositionChange, 3: SizeChange, 4: PositionAndSizeChange）
let condition_ID = 1;
// 条件名
let condition_name = "Baseline";

// スクリーンの幅・高さ（参加者側）
let screenMyWidth = window.innerWidth;
let screenMyHeight = window.innerHeight;
// スクロール位置を取得（参加者側）
let scrollMyX = window.scrollX;
let scrollMyY = window.scrollY;

// スクリーンの幅・高さ（対話相手側）
let screenOtherWidth = window.innerWidth;
let screenOtherHeight = window.innerHeight;
// スクロール位置を取得（対話相手側）
let scrollOtherX = window.scrollX;
let scrollOtherY = window.scrollY;

// ビデオウィンドウの大きさの最小値・最大値
const width_min = 50;
const width_max = 500;
// 移動量の拡大率
const distance_rate_move = 10000;

// ビデオウィンドウの大きさのデフォルト値（参加者・対話相手共通）
const default_width = (width_min + width_max) / 2;

// 対話相手のスクリーンの幅・高さの初期設定
function InitOtherScreenInfo(screen_width: number, screen_height: number, scroll_X: number, scroll_Y: number) {
  screenOtherWidth = screen_width;
  screenOtherHeight = screen_height;

  scrollOtherX = scroll_X;
  scrollOtherY = scroll_Y;
}

// ビデオウィンドウのInfoの更新（index = 0：参加者自身のビデオウィンドウ，index = 1：対話相手のビデオウィンドウ）
function setWindowInfo(fc_d_from_fc_vector: number[], rad_head_direction: number, screen_Width: number, screen_Height: number, scroll_X: number, scroll_Y: number, index: number) {
  // ビデオウィンドウのデフォルトの中心位置（対話相手側）
  const default_center_X = scroll_X + screenOtherWidth/2;
  const default_center_Y = scroll_Y + screenOtherHeight/2;
  // ビデオウィンドウのデフォルトのtop・left位置（対話相手側）
  const default_top = default_center_Y - default_width/2;
  const default_left = default_center_X - default_width/2;

  // ウィンドウの大きさの最大値に対する，実際のウィンドウの大きさの比率
  let next_width_rate = 0;
  // 顔の中心点を原点とした時の，正面を向いた際の顔の中心点のベクトルの長さによって，ウィンドウの大きさを変更
  if (150 * Norm(fc_d_from_fc_vector) <= 1) {
    next_width_rate = 1;
  }
  else {
    next_width_rate = 1 / (150 * Norm(fc_d_from_fc_vector));
  }

  // ウィンドウの大きさを踏まえて，ウィンドウの位置を決めるため，ウィンドウの大きさ → ウィンドウの位置の順に算出する
  // 1. ウィンドウの大きさの算出
  let width_value = width_max * (next_width_rate);

  // 移動平均を導入するために，値を保存
  move_width[index].push(width_value);

  if (move_width[index].length < 10) width_value = Average_value(move_width[index], 0, move_width[index].length - 1);
  else{
    if (move_width[index].length > MovingAverage_frame + 10) move_width[index].shift();
    width_value = Average_value(move_width[index], move_width[index].length - MovingAverage_frame, move_width[index].length - 1);
  }

  if (width_value < width_min) width_value = width_min;

  // PositionChange条件の時には，top・leftの値にwidth_valueの値が影響を与えないようにするために，width_valueの値を更新
  if (condition_ID === 2) width_value = default_width;

  // 2. ウィンドウの位置の算出
  let top_value = default_center_Y + distance_rate_move * Norm(fc_d_from_fc_vector) * Math.sin(rad_head_direction) - width_value/2;
  let left_value = default_center_X + distance_rate_move * Norm(fc_d_from_fc_vector) * Math.cos(rad_head_direction - Math.PI) - width_value/2;

  // フィールド領域をはみ出ないように調整を入れる
  if (top_value < 0) top_value = 0;
  else if (top_value > screen_Height - width_value) top_value = screen_Height - width_value;

  if (left_value < 0) left_value = 0;
  else if (left_value > screen_Width - width_value) left_value = screen_Width - width_value;

  // 移動平均を導入するために，値を保存
  move_top_positions[index].push(top_value);
  move_left_positions[index].push(left_value);

  // 移動平均の計算 + リストの肥大化の防止
  if (move_top_positions[index].length < 10) top_value = Average_value(move_top_positions[index], 0, move_top_positions[index].length - 1);
  else{
    if (move_top_positions[index].length > MovingAverage_frame + 10) move_top_positions[index].shift();
    top_value = Average_value(move_top_positions[index], move_top_positions[index].length - MovingAverage_frame, move_top_positions[index].length - 1);
  }

  if (move_left_positions[index].length < 10) left_value = Average_value(move_left_positions[index], 0, move_left_positions[index].length - 1);
  else{
    if (move_left_positions[index].length > MovingAverage_frame + 10) move_left_positions[index].shift();
    left_value = Average_value(move_left_positions[index], move_left_positions[index].length - MovingAverage_frame, move_left_positions[index].length - 1);
  }

  let newInfo: WindowInfo;

  switch(condition_ID) {
    case 1:  // Baseline条件
      newInfo = {
        top: default_top,
        left: default_left,
        width: default_width,
        screenWidth: screen_Width,
        screenHeight: screen_Height,
        scrollX: scroll_X,
        scrollY: scroll_Y
      };
      break;
    case 2:  // PositionChange条件
      newInfo = {
        top: top_value,
        left: left_value,
        width: default_width,
        screenWidth: screen_Width,
        screenHeight: screen_Height,
        scrollX: scroll_X,
        scrollY: scroll_Y
      };
      break;
    case 3:  // SizeChange条件
      newInfo = {
        top: default_center_Y - width_value/2,
        left: default_center_X - width_value/2,
        width: width_value,
        screenWidth: screen_Width,
        screenHeight: screen_Height,
        scrollX: scroll_X,
        scrollY: scroll_Y
      };
      break;
    case 4:  // PositionAndChange条件
      newInfo = {
        top: top_value,
        left: left_value,
        width: width_value,
        screenWidth: screen_Width,
        screenHeight: screen_Height,
        scrollX: scroll_X,
        scrollY: scroll_Y
      };
      break;
    default:  // Baseline条件
      newInfo = {
        top: default_top,
        left: default_left,
        width: default_width,
        screenWidth: screen_Width,
        screenHeight: screen_Height,
        scrollX: scroll_X,
        scrollY: scroll_Y
      };
      break;
  }

  return newInfo;
}

export const MainContent = () => {
  const appId = useMemo(() => process.env.REACT_APP_SKYWAY_APP_ID, []);
  const secretKey = useMemo(() => process.env.REACT_APP_SKYWAY_SECRET_KEY, []);

  const token = useMemo(() => {
    if (appId == null || secretKey == null) return undefined;

    return new SkyWayAuthToken({
      jti: uuidV4(),
      iat: nowInSec(),
      exp: nowInSec() + 60 * 60 * 24,
      scope: {
        app: {
          id: appId,
          turn: true,
          actions: ["read"],
          channels: [
            {
              id: "*",
              name: "*",
              actions: ["write"],
              members: [
                {
                  id: "*",
                  name: "*",
                  actions: ["write"],
                  publication: {
                    actions: ["write"],
                  },
                  subscription: {
                    actions: ["write"],
                  },
                },
              ],
              sfuBots: [
                {
                  actions: ["write"],
                  forwardings: [
                    {
                      actions: ["write"],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    }).encode(secretKey);
  }, [appId, secretKey]);

  const localVideo = useRef<HTMLVideoElement>(null);

  // ローカルストリームをここに保持する
  const [localStream, setLocalStream] = useState<{
    audio: LocalAudioStream;
    video: LocalVideoStream;
  }>();
  const [ localDataStream, setLocalDataStream ] = useState<LocalDataStream>();
  // console.log(localDataStream);
  // me.subscribe(publication.id) の戻り値に含まれる stream
  // (contentType === "data" のもの)
  const [ otherUserDataStream, setOtherUserDataStream ] = useState<RemoteDataStream>();
  // console.log(otherUserDataStream);

  // tokenとvideo要素の参照ができたら実行
  useEffect(() => {
    // ビデオの初期設定
    const initialize = async () => {
      if (token == null || localVideo.current == null) return;

      const stream = 
        await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
      stream.video.attach(localVideo.current);

      const dataStream = await SkyWayStreamFactory.createDataStream();

      await localVideo.current.play();
      setLocalStream(stream);
      setLocalDataStream(dataStream);
    };

    initialize();
    // console.log("初期化がされました！");
  }, [token, localVideo]);

  // 自分自身のウィンドウの位置・大きさの調整
  const [ myWindowInfo, setMyWindowInfo ] = useState<WindowInfo>({ 
    top: scrollMyY + screenMyWidth/2 - default_width/2, left: scrollMyX + screenMyWidth/2 - default_width/2, width: default_width, 
    screenWidth: screenMyWidth, screenHeight: screenMyHeight, scrollX: scrollMyX, scrollY: scrollMyY
  });

  const myWindowContainerStyle = useMemo<React.CSSProperties>(() => ({
      position: "absolute",
      top: myWindowInfo.top,
      left: myWindowInfo.left,
      width: myWindowInfo.width
  }), [ myWindowInfo ]);

  // 対話相手側に送信するウィンドウ情報の設定（対話相手側のスクリーンに基づいて，自分自身の）
  const [ myWindowInfo_based_on_OtherScreen, setMyWindowInfo_based_on_OtherScreen ] = useState<WindowInfo>({ 
    top: scrollOtherY + screenOtherWidth/2 - default_width/2, left: scrollOtherX + screenOtherWidth/2 - default_width/2, width: default_width, 
    screenWidth: screenOtherWidth, screenHeight: screenOtherHeight, scrollX: scrollOtherX, scrollY: scrollOtherY
  });

  // myWindowPositionが更新された時の処理
  useEffect(() => {
    // console.log("自分のデータ送信中...");
    if (localDataStream != null) {
      localDataStream.write(myWindowInfo_based_on_OtherScreen);
      // console.log("自分のデータを送信しました！");
    }
  }, [ myWindowInfo_based_on_OtherScreen ]);

  // MediaPipeを用いて，対話相手の頭部方向を取得
  const webcamRef = useRef<Webcam>(null);
  const resultsRef = useRef<Results>();

  /** 検出結果（フレーム毎に呼び出される） */
  const onResults = useCallback((results: Results) => {
    // console.log(results);  // デバッグ用

    // 顔の座標が正しく取得できている時のみ実行
    if (results.multiFaceLandmarks.length > 0) {
      // 検出結果の格納
      resultsRef.current = results;

      // 頭部方向の取得
      let landmarks_pos_x: number[] = []  // 468個の点のx座標を格納するリスト
      let landmarks_pos_y: number[] = []  // 468個の点のy座標を格納するリスト
      let face_center_default_pos: number[] = []  // 正面を向いた時の顔の中心点（ここでは，飯塚さんの修論に倣って，鼻の先の座標としている．）
      if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
        for (let id = 0; id < results.multiFaceLandmarks[0].length; id++) {
          // 特定の顔の点を取得（x座標）
          if (results.multiFaceLandmarks[0][id].x < 0) landmarks_pos_x.push(0);
          else if (results.multiFaceLandmarks[0][id].x > 1) landmarks_pos_x.push(1);
          else landmarks_pos_x.push(results.multiFaceLandmarks[0][id].x);

          // 特定の顔の点を取得（y座標）
          if (results.multiFaceLandmarks[0][id].y < 0) landmarks_pos_y.push(0);
          else if (results.multiFaceLandmarks[0][id].y > 1) landmarks_pos_y.push(1);
          else landmarks_pos_y.push(results.multiFaceLandmarks[0][id].y);

          // 正面を向いた時の顔の中心点を取得（x，y座標）
          if (id === 1) {
            // x座標
            if (results.multiFaceLandmarks[0][id].x < 0) face_center_default_pos.push(0);
            else if (results.multiFaceLandmarks[0][id].x > 1) face_center_default_pos.push(1);
            else face_center_default_pos.push(results.multiFaceLandmarks[0][id].x);

            // y座標
            if (results.multiFaceLandmarks[0][id].y < 0) face_center_default_pos.push(0);
            else if (results.multiFaceLandmarks[0][id].y > 1) face_center_default_pos.push(1);
            else face_center_default_pos.push(results.multiFaceLandmarks[0][id].y);
          }
        }
      }
      // 顔の中心点の座標
      const face_center_pos = [Average_value(landmarks_pos_x), Average_value(landmarks_pos_y)];
      // 頭部方向を計算するためのベクトル
      const base_vector = [1,0];
      // 顔の中心点を原点とした時の，正面を向いた際の顔の中心点のベクトル
      const fc_d_from_fc_vector = [face_center_default_pos[0] - face_center_pos[0], face_center_default_pos[1] - face_center_pos[1]];
      // console.log("face_center_pos = " + face_center_default_pos);
      // console.log("face_center_default_pos = " + face_center_default_pos);
      // console.log("fc_d_from_fc_vector = " + fc_d_from_fc_vector);
      
      // 頭部方向（ラジアン）
      let rad_head_direction = Math.acos(Inner(base_vector, fc_d_from_fc_vector) / (Norm(base_vector) * Norm(fc_d_from_fc_vector)));
      // 頭部方向（度）
      // let theta_head_direction = rad_head_direction * (180 / Math.PI);
      // arccosの値域が0～πであるため，上下の区別をするために，上を向いている時には，ラジアンおよび度の値を更新する
      if (fc_d_from_fc_vector[1] < 0) {
        rad_head_direction = -rad_head_direction;
        // theta_head_direction = Math.PI * 2 - theta_head_direction;
      }
      // console.log("theta_head_direction = " + theta_head_direction);
      // console.log("diff_top = " + distance_rate_move * Norm(fc_d_from_fc_vector) * Math.sin(rad_head_direction));
      // console.log("diff_left = " + distance_rate_move * Norm(fc_d_from_fc_vector) * Math.cos(rad_head_direction));

      // widthの範囲：50~500？
      // 要検討：ウィンドウの動きとユーザの実際の動きを合わせるために，左右反転させる？
      // 自分自身のスクリーンに対するビデオウィンドウの位置の更新（index = 0：自分自身側のスクリーン基準，index = 1：対話相手側のスクリーン基準）
      setMyWindowInfo(pre => setWindowInfo(fc_d_from_fc_vector, rad_head_direction, screenMyWidth, screenMyHeight, scrollMyX, scrollMyY, 0));
      setMyWindowInfo_based_on_OtherScreen(pre => setWindowInfo(fc_d_from_fc_vector, rad_head_direction, screenOtherWidth, screenOtherHeight, scrollOtherX, scrollOtherY, 1));
    }
  },[]);

  useEffect(() => {
    const faceMesh = new FaceMesh({
      locateFile: file => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      }
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true, // landmarks 468 -> 478
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);

    if (webcamRef.current) {
      const camera = new Camera(webcamRef.current.video!, {
        onFrame: async () => {
          await faceMesh.send({ image: webcamRef.current!.video! })
        }
      });
      camera.start();
    }

    return () => {
        faceMesh.close();
    }
  }, [onResults]);

  // 他ユーザの座標情報を保持
  // （これを自分のアイコンと同様に画面表示用のstyleに反映する）
  const [ otherUserWindowInfo, setOtherUserWindowInfo ] = useState<WindowInfo>({
    top: scrollOtherY + screenOtherWidth/2 - default_width/2, left: scrollOtherX + screenOtherWidth/2 - default_width/2, width: default_width, 
    screenWidth: screenOtherWidth, screenHeight: screenOtherHeight, scrollX: scrollOtherX, scrollY: scrollOtherY
   });

  // 他ユーザのウィンドウの位置・大きさの変更
  const otherUserWindowContainerStyle = useMemo<React.CSSProperties>(() => ({
    position: "absolute",
    top: otherUserWindowInfo.top,
    left: otherUserWindowInfo.left,
    width: otherUserWindowInfo.width
  }), [ otherUserWindowInfo ]);

  useEffect(() => {
    // console.log("相手のデータ受信設定");
    if (otherUserDataStream != null) {
      // callbackで受信座標を反映する
      otherUserDataStream.onData.add((args) => {
        setOtherUserWindowInfo(args as WindowInfo);
        // 対話相手のスクリーン情報の初期化
        InitOtherScreenInfo(otherUserWindowInfo.screenWidth, otherUserWindowInfo.screenHeight, otherUserWindowInfo.scrollX, otherUserWindowInfo.scrollY);
        console.log("対話相手のスクリーンの幅 = " + otherUserWindowInfo.screenWidth);  // デバッグ用
        console.log("対話相手のスクリーンの高さ = " + otherUserWindowInfo.screenHeight);  // デバッグ用

        // console.log("相手のデータを受信しました！");
      });
    }
  }, [ otherUserDataStream ]);

  // ルーム名
  const [ roomName, setRoomName ] = useState("");
  // 自分自身の参加者情報
  const [ me, setMe ] = useState<LocalP2PRoomMember>();

  // ルームに入ることができるかの確認
  const canJoin = useMemo(() => {
    return roomName !== "" && localStream != null && me == null;
  }, [roomName, localStream, me]);

  // Joinボタンをクリックした時に実行する関数
  const onJoinClick = useCallback(async () => {
    // canJoinまでにチェックされるので，普通は起きない
    // assertionメソッドにしてもいい
    if (localStream == null || token == null) return;

    const context = await SkyWayContext.Create(token);

    // ルームを取得、または新規作成
    const room = await SkyWayRoom.FindOrCreate(context, {
      type: 'p2p',
      name: roomName,
    });

    const me = await room.join();
    setMe(me);

    // 映像と音声を配信
    await me.publish(localStream.video);
    await me.publish(localStream.audio);
    if (localDataStream !== undefined) {
      console.log("published data stream");
      await me.publish(localDataStream);
    }

    // 自分以外の参加者情報を取得
    const otherPublifications = room.publications.filter(p => p.publisher.id !== me.id);
    setOtherUserPublications(otherPublifications);
    // console.log(otherPublifications);
    for (let i = 0; i < otherPublifications.length; i++) {
      if (otherPublifications[i].contentType === "data") {
        const { stream } = await me.subscribe(otherPublifications[i].id);
        if (stream.contentType === "data") {
          setOtherUserDataStream(stream);
        }
      }
    }

    // その後に参加してきた人の情報を取得
    room.onStreamPublished.add(async (e) => {
      if (e.publication.publisher.id !== me.id) {
        setOtherUserPublications(pre => [ ...pre, e.publication ]);
      }

      console.log(e);
      if (e.publication.contentType === "data" && e.publication.publisher.id !== me.id) {
        console.log("DataStreamを購読しました！");
        const { stream } = await me.subscribe(e.publication.id);
        // ここは必ずRemoteDataStreamになるはず
        if (stream.contentType === "data") {
          console.log("!!!!!!!!!", stream);
          setOtherUserDataStream(stream);
          // データ受信時のcallbackを登録
          // const { removeListener } = stream.onData.add((data) => setOtherUserWindowPosition(data as WindowPosition));
    
          // 購読解除する時
          // removeListener();
        }
      }
    });

    // 部屋名のみを表示させる
    document.getElementById("active-after-conference")?.classList.remove("non-active");
    document.getElementById("active-before-conference")?.classList.add("non-active");

  }, [roomName, token, localStream, localDataStream]);

  const [ otherUserPublications, setOtherUserPublications ] = useState<RoomPublication<LocalStream>[]>([]);
  
  return (
    <div>
      <div id="active-before-conference">
        <p>
        condition=
        <select id="condition" onChange={(event) => { 
          condition_ID = Number(event.target.value);
          switch(condition_ID) {
            case 1:
              condition_name = "Baseline";
              break;
            case 2:
              condition_name = "PositionChange";
              break;
            case 3:
              condition_name = "SizeChange";
              break;
            case 4:
              condition_name = "PositionAndSizeChange";
              break;
            default:
              condition_name = "";
              break;
          }
        }}>
          <option value="1">Baseline</option>
          <option value="2">PositionChange</option>
          <option value="3">SizeChange</option>
          <option value="4">PositionAndSizeChange</option>
        </select>　
        {/* ID: {me?.id ?? ""} */}
        </p>
        room name: <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
        <button onClick={onJoinClick} disabled={!canJoin}>join</button>
      </div>
      <div id="active-after-conference" className="non-active">
        ID: {me?.id ?? ""}　room name: {roomName}　condition: {condition_name}
      </div>
      {/* <div className="field-area" tabIndex={-1} onKeyDown={ onKeyDown }> */}
        <div className="icon-container">
          <video id="local-video" ref={localVideo} muted playsInline style={myWindowContainerStyle}></video>
          <Webcam id="local-video" ref={webcamRef} muted playsInline style={myWindowContainerStyle}/>
        </div>
        <div className="icon-container">
        {
          me != null && otherUserPublications.map(p => (
            <RemoteMedia id="remote-video" key={p.id} me={me} publication={p} style={otherUserWindowContainerStyle}/>
          ))
        }
        </div>
      {/* </div> */}
    </div>
  )
}