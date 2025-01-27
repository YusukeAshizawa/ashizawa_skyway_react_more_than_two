import { LocalAudioStream, LocalDataStream, LocalP2PRoomMember, LocalStream, LocalVideoStream, nowInSec, RemoteDataStream, RoomPublication, SkyWayAuthToken, SkyWayContext, SkyWayRoom, SkyWayStreamFactory, uuidV4 } from "@skyway-sdk/room";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RemoteMedia } from "./RemoteMedia";
import "./MainContent.css"
import { FaceMesh, Results } from '@mediapipe/face_mesh';
import { Camera } from "@mediapipe/camera_utils";
import Webcam from "react-webcam";
import { CSVLink } from "react-csv";
// import webgazer, { GazeData } from 'webgazer';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

// 参加者ID
let participantID = 1;
// 条件番号・条件名
let conditionID = 1;
// 条件名
let conditionName = "Baseline";
// ルーム名
let roomName = "";

// CSVファイルとして書き出すデータの収集を開始するタイミングの制御
let nowTest = false;
// 計測スタート時間
let startTime = 0;

// ビデオウィンドウの情報
interface WindowAndAudioAndParticipantsInfo {
    top_diff: number;  // 位置を移動させる場合の上下方向の変化量
    left_diff: number;  // 位置を移動させる場合の左右方向の変化量
    width: number;
    height: number;  // heightはwidthのHeightPerWidthRate倍
    border_r: number;  // ビデオウィンドウの枠の色（赤）の値
    border_g: number;  // ビデオウィンドウの枠の色（緑）の値
    border_b: number;  // ビデオウィンドウの枠の色（青）の値
    border_a: number;  // ビデオウィンドウの枠の色の透明度の値
    theta: number;  // 頭部方向（度）
    width_inCaseOf_change: number;  // ビデオウィンドウの大きさを変更した場合の大きさ
    status: boolean;  // 発言者か否か
    text: string;  // 発言内容
}

// CSVファイルに書き出す頭部方向の情報
interface CSV_HeadDirection_Info {
  ID: number;
  condition: number;
  startTime: number;
  endTime: number;
  myTheta: number;
  myWindowWidth: number;
  otherTheta: number;
  otherWindowWidth: number;
}

// CSVファイルに書き出す視線の情報
interface CSV_Gaze_Info {
  ID: number;
  condition: number;
  startTime: number;
  endTime: number;
  myGazeX: number;
  myGazeY: number;
}

// CSVファイルに書き出す音声データ・参加者の状態（発話者か否か）の情報
interface CSV_AudioAndParticipants_Info {
  ID: number;
  Condition: number;
  startTime: number;
  endTime: number;
  myStatus: boolean;
  myText: string;
  otherStatus: boolean;
  otherText: string;
}

// CSVファイルに書き出す発話内容の情報
interface CSV_Talk_Info {
  ID: number;
  Condition: number;
  startTime: number;
  endTime: number;
  myStatus: boolean;
  myText: string;
  otherStatus: boolean;
  otherText: string;
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
let move_top_diffs: number[] = [];
let move_left_diffs: number[] = [];
let move_width: number[] = [];
let move_border_a: number[] = [];

// スクリーンの幅・高さ（参加者側）
let screenMyWidth = window.innerWidth;
let screenMyHeight = window.innerHeight;
// ブラウザウィンドウの左上の位置を取得（参加者側）
let scrollMyX = window.scrollX;
let scrollMyY = window.scrollY;

// ビデオウィンドウの大きさの最小値・最大値
const width_min = 100;
const width_max = 500;
// 移動量の拡大率
const distance_rate_move = 10000;

// ビデオウィンドウの大きさのデフォルト値（参加者・対話相手共通）
const default_width = (width_min + width_max) / 2;
const HeightPerWidthRate = 0.75;

// 位置の移動を行う場合の，スクリーンの中心からのずれ
const default_top_diff = 0;
const default_left_diff = 0;

// ビデオウィンドウの枠の色の値
const default_border_r = 83;
const default_border_g = 253;
const default_border_b = 49;
const default_border_a = 0;

// ビデオウィンドウの枠の色の最小値・最大値
const border_a_min = 0;
const border_a_max = 1;

// ビデオウィンドウの枠の色を完全に透明にする時の閾値
const border_a_min_threshold = 0.015;

// ビデオウィンドウの大きさの一次保存（大きさを変更しない条件でも分析できるようにするため）
let myWindowWidth_tmp_value = 0;

// ビデオウィンドウのInfoの更新+音声データの追加
function setWindowAndAudioAndParticipantsInfo(conditionID: number, fc_d_from_fc_vector: number[], rad_head_direction: number, theta_head_direction: number, status: boolean, text: string) {
  // ウィンドウの大きさの最大値に対する，実際のウィンドウの大きさの比率
  let next_width_rate = 0;
  // ビデオウィンドウの枠の色の透明度の比率
  let next_border_a_rate = 0;
  // 顔の中心点を原点とした時の，正面を向いた際の顔の中心点のベクトルの長さによって，ウィンドウの大きさ・ビデオウィンドウの枠の色の透明度を変更
  if (150 * Norm(fc_d_from_fc_vector) <= 1) {
    next_width_rate = 1;
    next_border_a_rate = 1;
  }
  else {
    next_width_rate = 1 / (150 * Norm(fc_d_from_fc_vector));
    next_border_a_rate = 1 / (150 * Norm(fc_d_from_fc_vector));
  }

  // ウィンドウの大きさを踏まえて，ウィンドウの位置を決めるため，ウィンドウの大きさ → ウィンドウの位置の順に算出する
  // 1. ウィンドウの大きさの算出
  let width_value = width_max * next_width_rate;

  // ビデオウィンドウの枠の色の透明度の変更
  let border_a_value = border_a_max * next_border_a_rate;

  // 移動平均を導入するために，値を保存（ビデオウィンドウの大きさ・ビデオウィンドウの枠の色の透明度）
  move_width.push(width_value);
  move_border_a.push(border_a_value);

  // 移動平均の計算 + リストの肥大化の防止（ビデオウィンドウの大きさ）
  if (move_width.length < MovingAverage_frame) width_value = Average_value(move_width, 0, move_width.length - 1);
  else{
    if (move_width.length > MovingAverage_frame + 10) move_width.shift();
    width_value = Average_value(move_width, move_width.length - MovingAverage_frame, move_width.length - 1);
  }

  // 移動平均の計算 + リストの肥大化の防止（ビデオウィンドウの大きさ）
  if (move_border_a.length < MovingAverage_frame) border_a_value = Average_value(move_border_a, 0, move_border_a.length - 1);
  else{
    if (move_border_a.length > MovingAverage_frame + 10) move_border_a.shift();
    border_a_value = Average_value(move_border_a, move_border_a.length - MovingAverage_frame, move_border_a.length - 1);
  }

  // 最小値の考慮（ビデオウィンドウの大きさ・ビデオウィンドウの枠の色の透明度）
  if (width_value < width_min) width_value = width_min;
  if (border_a_value < border_a_min_threshold) border_a_value = border_a_min;

  // CSVファイルへの保存用
  // ビデオウィンドウの大きさの一次保存（大きさを変更しない条件でも分析できるようにするため）
  myWindowWidth_tmp_value = width_value;
  // eslint-disable-next-line
  // console.log(myWindowWidth_tmp_value);  // デバッグ用

  // BaseLine条件・PositionChange・FrameChange条件の時には，top・leftの値にwidth_valueの値が影響を与えないようにするために，width_valueの値を更新
  if (conditionID === 1 || conditionID === 2 || conditionID === 4) width_value = default_width;

  // 2. ウィンドウの位置の算出
  let top_diff_value = distance_rate_move * Norm(fc_d_from_fc_vector) * Math.sin(rad_head_direction) - width_value/2;
  let left_diff_value = distance_rate_move * Norm(fc_d_from_fc_vector) * Math.cos(rad_head_direction - Math.PI) - width_value/2;

  // 移動平均を導入するために，値を保存（ビデオウィンドウのスクリーン中心からのずれ）
  move_top_diffs.push(top_diff_value);
  move_left_diffs.push(left_diff_value);

  // 移動平均の計算 + リストの肥大化の防止（ビデオウィンドウのスクリーン中心からのずれ）
  if (move_top_diffs.length < MovingAverage_frame) top_diff_value = Average_value(move_top_diffs, 0, move_top_diffs.length - 1);
  else{
    if (move_top_diffs.length > MovingAverage_frame + 10) move_top_diffs.shift();
    top_diff_value = Average_value(move_top_diffs, move_top_diffs.length - MovingAverage_frame, move_top_diffs.length - 1);
  }
  if (move_left_diffs.length < MovingAverage_frame) left_diff_value = Average_value(move_left_diffs, 0, move_left_diffs.length - 1);
  else{
    if (move_left_diffs.length > MovingAverage_frame + 10) move_left_diffs.shift();
    left_diff_value = Average_value(move_left_diffs, move_left_diffs.length - MovingAverage_frame, move_left_diffs.length - 1);
  }

  let newInfo: WindowAndAudioAndParticipantsInfo;

  switch(conditionID) {
    case 1:  // Baseline条件
      newInfo = {
        top_diff: default_top_diff,
        left_diff: default_left_diff,
        width: default_width,
        height: default_width * HeightPerWidthRate,
        border_r: default_border_r,
        border_g: default_border_g,
        border_b: default_border_b,
        border_a: default_border_a,
        width_inCaseOf_change: myWindowWidth_tmp_value,
        theta: theta_head_direction,
        status: status,
        text: text
      };
      break;
    case 2:  // FrameChange条件
      newInfo = {
        top_diff: default_top_diff,
        left_diff: default_left_diff,
        width: default_width,
        height: default_width * HeightPerWidthRate,
        border_r: default_border_r,
        border_g: default_border_g,
        border_b: default_border_b,
        border_a: border_a_value,
        width_inCaseOf_change: myWindowWidth_tmp_value,
        theta: theta_head_direction,
        status: status,
        text: text
      }
      break;
    case 3:  // SizeChange条件
      newInfo = {
        top_diff: default_top_diff,
        left_diff: default_left_diff,
        width: width_value,
        height: width_value * HeightPerWidthRate,
        border_r: default_border_r,
        border_g: default_border_g,
        border_b: default_border_b,
        border_a: default_border_a,
        width_inCaseOf_change: myWindowWidth_tmp_value,
        theta: theta_head_direction,
        status: status,
        text: text
      };
      break;
    case 4:  // PositionChange条件
      newInfo = {
        top_diff: top_diff_value,
        left_diff: left_diff_value,
        width: default_width,
        height: default_width * HeightPerWidthRate,
        border_r: default_border_r,
        border_g: default_border_g,
        border_b: default_border_b,
        border_a: default_border_a,
        width_inCaseOf_change: myWindowWidth_tmp_value,
        theta: theta_head_direction,
        status: status,
        text: text
      };
      break;
    case 5:  // PositionAndSizeChange条件
      newInfo = {
        top_diff: top_diff_value,
        left_diff: left_diff_value,
        width: width_value,
        height: width_value * HeightPerWidthRate,
        border_r: default_border_r,
        border_g: default_border_g,
        border_b: default_border_b,
        border_a: default_border_a,
        width_inCaseOf_change: myWindowWidth_tmp_value,
        theta: theta_head_direction,
        status: status,
        text: text
      };
      break;
    default:  // Baseline条件
      newInfo = {
        top_diff: default_top_diff,
        left_diff: default_left_diff,
        width: default_width,
        height: default_width * HeightPerWidthRate,
        border_r: default_border_r,
        border_g: default_border_g,
        border_b: default_border_b,
        border_a: default_border_a,
        width_inCaseOf_change: myWindowWidth_tmp_value,
        theta: theta_head_direction,
        status: status,
        text: text
      };
      break;
  }

  return newInfo;
}

export const MainContent = () => {
  // 自分自身の参加者情報
  const [ me, setMe ] = useState<LocalP2PRoomMember>();

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
  // eslint-disable-next-line
  // console.log(localDataStream);  // デバッグ用
  // me.subscribe(publication.id) の戻り値に含まれる stream
  // (contentType === "data" のもの)
  const [ otherUserDataStream, setOtherUserDataStream ] = useState<RemoteDataStream>();
  // eslint-disable-next-line
  // console.log(otherUserDataStream);  // デバッグ用

  // tokenとvideo要素の参照ができたら実行
  // ビデオの初期設定
  useEffect(() => {
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
    // eslint-disable-next-line
    // console.log("初期化がされました！");  // デバッグ用
  }, [token, localVideo]);

  // 自分自身のウィンドウの位置・大きさの調整
  const [ myWindowAndAudioAndParticipantsInfo, setMyWindowAndAudioAndParticipantsInfo ] = useState<WindowAndAudioAndParticipantsInfo>({ 
    top_diff: default_top_diff, left_diff: default_left_diff, width: default_width, height: default_width * HeightPerWidthRate,
    border_r: default_border_r, border_g: default_border_g, border_b: default_border_b, border_a: default_border_a, width_inCaseOf_change: 0, theta: 0, status: false, text: ""
  });

  // フィールド領域をはみ出ないように調整を入れる
  const myWindowAndAudioContainerStyle = useMemo<React.CSSProperties>(() => ({
      position: "absolute",
      top: scrollMyY + screenMyHeight / 2 - myWindowAndAudioAndParticipantsInfo.height / 2 + myWindowAndAudioAndParticipantsInfo.top_diff < 0 ? 0 :
           scrollMyY + screenMyHeight / 2 - myWindowAndAudioAndParticipantsInfo.height / 2 + myWindowAndAudioAndParticipantsInfo.top_diff > screenMyHeight - myWindowAndAudioAndParticipantsInfo.height / 2 ? screenMyHeight - myWindowAndAudioAndParticipantsInfo.height / 2 : 
           scrollMyY + screenMyHeight / 2 - myWindowAndAudioAndParticipantsInfo.height / 2 + myWindowAndAudioAndParticipantsInfo.top_diff,
      left: scrollMyX + screenMyWidth / 2 - myWindowAndAudioAndParticipantsInfo.width / 2 + myWindowAndAudioAndParticipantsInfo.left_diff < 0 ? 0 :
            scrollMyX + screenMyWidth / 2 - myWindowAndAudioAndParticipantsInfo.width / 2 + myWindowAndAudioAndParticipantsInfo.left_diff > screenMyWidth - myWindowAndAudioAndParticipantsInfo.width / 2 ? screenMyWidth - myWindowAndAudioAndParticipantsInfo.width : 
            scrollMyX + screenMyWidth / 2 - myWindowAndAudioAndParticipantsInfo.width / 2 + myWindowAndAudioAndParticipantsInfo.left_diff,
      width: myWindowAndAudioAndParticipantsInfo.width,
      border: `10px solid rgba(${myWindowAndAudioAndParticipantsInfo.border_r}, ${myWindowAndAudioAndParticipantsInfo.border_g}, ${myWindowAndAudioAndParticipantsInfo.border_b}, ${myWindowAndAudioAndParticipantsInfo.border_a})`
  }), [ myWindowAndAudioAndParticipantsInfo ]);

  // myWindowPositionが更新された時の処理
  useEffect(() => {
    // eslint-disable-next-line
    // console.log("自分のデータ送信中...");
    if (localDataStream != null) {
      localDataStream.write(myWindowAndAudioAndParticipantsInfo);
      // eslint-disable-next-line
      // console.log("自分のデータを送信しました！");  // デバッグ用
      // eslint-disable-next-line
      // console.log("送信前のwidth_inCaseOf_changeの値：" + myWindowAndAudioAndParticipantsInfo.width_inCaseOf_change);  // デバッグ用
    }
  }, [ myWindowAndAudioAndParticipantsInfo ]);

  
  // 音声の初期設定
  const webSpeechAudio = useSpeechRecognition();

  // MediaPipeを用いて，会話相手の頭部方向を取得
  const webcamRef = useRef<Webcam>(null);
  const resultsRef = useRef<Results>();
  // 自分・会話相手の頭部方向のログデータをCSVファイルとして書き出す
  const CSV_HeadDirection_Ref = useRef<CSVLink & HTMLAnchorElement & { link: HTMLAnchorElement }>(null);
  const [headDirectionResults, setHeadDirectionResults] = useState<CSV_HeadDirection_Info[]>([]);
  // 自分・会話相手の視線のログデータをCSVファイルとして書き出す
  const CSV_Gaze_Ref = useRef<CSVLink & HTMLAnchorElement & { link: HTMLAnchorElement }>(null);
  const [gazeResults, setGazeResults] = useState<CSV_Gaze_Info[]>([]);
  // 音声データをCSVファイルとして書き出す
  const CSV_AudioAndParticipants_Ref = useRef<CSVLink & HTMLAnchorElement & { link: HTMLAnchorElement }>(null);
  const [audioAndParticipantsResults, setAudioAndParticipantsResults] = useState<CSV_AudioAndParticipants_Info[]>([]);
  // 会話全体の発話内容のログデータをCSVファイルとして書き出す
  const CSV_Talk_Ref = useRef<CSVLink & HTMLAnchorElement & { link: HTMLAnchorElement }>(null);
  const [talkResults, setTalkResults] = useState<CSV_Talk_Info[]>([]);

  /** 検出結果（フレーム毎に呼び出される） */
  const onResults = useCallback((results: Results) => {
    // eslint-disable-next-line
    // console.log(results);  // デバッグ用

    // 顔の座標が正しく取得できている時のみ実行
    if (results.multiFaceLandmarks.length > 0) {
      // 検出結果の格納
      resultsRef.current = results;

      // 頭部方向の取得
      let landmarks_pos_x: number[] = []  // 468個の点のx座標を格納するリスト
      let landmarks_pos_y: number[] = []  // 468個の点のy座標を格納するリスト
      let face_center_default_pos: number[] = []  // 正面を向いた時の顔の中心点（ここでは，飯塚さんの修論に倣って，鼻の先の座標としている．）
      // const Start_OnePoint = performance.now();  // 1点の処理の開始時刻
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
      // const End_OnePoint = performance.now();  // 1点の処理の終了時刻
      // eslint-disable-next-line
      // console.log("処理時間：" + (End_OnePoint - Start_OnePoint) + "ミリ秒");  // デバッグ用
      // 頭部方向を計算するためのベクトル
      const base_vector = [1,0];
      // 顔の中心点を原点とした時の，正面を向いた際の顔の中心点のベクトル
      const fc_d_from_fc_vector = [face_center_default_pos[0] - face_center_pos[0], face_center_default_pos[1] - face_center_pos[1]];
      // eslint-disable-next-line
      // console.log("face_center_pos = " + face_center_default_pos);  // デバッグ用
      // eslint-disable-next-line
      // console.log("face_center_default_pos = " + face_center_default_pos);  // デバッグ用
      // eslint-disable-next-line
      // console.log("fc_d_from_fc_vector = " + fc_d_from_fc_vector);  // デバッグ用
      
      // 頭部方向（ラジアン）
      let rad_head_direction = Math.acos(Inner(base_vector, fc_d_from_fc_vector) / (Norm(base_vector) * Norm(fc_d_from_fc_vector)));
      // 頭部方向（度）
      let theta_head_direction = rad_head_direction * (180 / Math.PI);
      // arccosの値域が0～πであるため，上下の区別をするために，上を向いている時には，ラジアンおよび度の値を更新する
      if (fc_d_from_fc_vector[1] < 0) {
        rad_head_direction = -rad_head_direction;
        theta_head_direction = Math.PI * 2 - theta_head_direction;
      }
      // eslint-disable-next-line
      // console.log("theta_head_direction = " + theta_head_direction);  // デバッグ用
      // eslint-disable-next-line
      // console.log("diff_top = " + distance_rate_move * Norm(fc_d_from_fc_vector) * Math.sin(rad_head_direction));  // デバッグ用
      // eslint-disable-next-line
      // console.log("diff_left = " + distance_rate_move * Norm(fc_d_from_fc_vector) * Math.cos(rad_head_direction));  // デバッグ用

      // widthの範囲：100~500？
      // 要検討：ウィンドウの動きとユーザの実際の動きを合わせるために，左右反転させる？
      // 自分自身のスクリーンに対するビデオウィンドウの位置の更新（index = 0：自分自身側のスクリーン基準，index = 1：対話相手側のスクリーン基準）
      setMyWindowAndAudioAndParticipantsInfo(pre => setWindowAndAudioAndParticipantsInfo(conditionID, fc_d_from_fc_vector, rad_head_direction, theta_head_direction, isSpeaker, webSpeechAudio != null ? webSpeechAudio.transcript : ""));
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
  const [ otherUserWindowAndAudioAndParticipantsInfo, setOtherUserWindowAndAudioAndParticipantsInfo ] = useState<WindowAndAudioAndParticipantsInfo>({
    top_diff: default_top_diff, left_diff: default_left_diff, width: default_width, height: default_width * HeightPerWidthRate,
    border_r: default_border_r, border_g: default_border_g, border_b: default_border_b, border_a: default_border_a, width_inCaseOf_change: 0, theta: 0, status: false, text: ""
   });

  // 他ユーザのウィンドウの位置・大きさの変更
  // フィールド領域をはみ出ないように調整を入れる
  const otherUserWindowAndAudioContainerStyle = useMemo<React.CSSProperties>(() => ({
    position: "absolute",
    top: scrollMyY + screenMyHeight / 2 - otherUserWindowAndAudioAndParticipantsInfo.height / 2 + otherUserWindowAndAudioAndParticipantsInfo.top_diff < 0 ? 0 :
         scrollMyY + screenMyHeight / 2 - otherUserWindowAndAudioAndParticipantsInfo.height / 2 + otherUserWindowAndAudioAndParticipantsInfo.top_diff > screenMyHeight - otherUserWindowAndAudioAndParticipantsInfo.height / 2 ? screenMyHeight - otherUserWindowAndAudioAndParticipantsInfo.height / 2 : 
         scrollMyY + screenMyHeight / 2 - otherUserWindowAndAudioAndParticipantsInfo.height / 2 + otherUserWindowAndAudioAndParticipantsInfo.top_diff,
    left: scrollMyX + screenMyWidth / 2 - otherUserWindowAndAudioAndParticipantsInfo.width / 2 + otherUserWindowAndAudioAndParticipantsInfo.left_diff < 0 ? 0 :
          scrollMyX + screenMyWidth / 2 - otherUserWindowAndAudioAndParticipantsInfo.width / 2 + otherUserWindowAndAudioAndParticipantsInfo.left_diff > screenMyWidth - otherUserWindowAndAudioAndParticipantsInfo.width / 2 ? screenMyWidth - otherUserWindowAndAudioAndParticipantsInfo.width : 
          scrollMyX + screenMyWidth / 2 - otherUserWindowAndAudioAndParticipantsInfo.width / 2 + otherUserWindowAndAudioAndParticipantsInfo.left_diff,
    width: otherUserWindowAndAudioAndParticipantsInfo.width,
    border: `10px solid rgba(${otherUserWindowAndAudioAndParticipantsInfo.border_r}, ${otherUserWindowAndAudioAndParticipantsInfo.border_g}, ${otherUserWindowAndAudioAndParticipantsInfo.border_b}, ${otherUserWindowAndAudioAndParticipantsInfo.border_a})`
  }), [ otherUserWindowAndAudioAndParticipantsInfo ]);

  useEffect(() => {
    // eslint-disable-next-line
    // console.log("相手のデータ受信設定");
    if (otherUserDataStream != null) {
      // callbackで受信座標を反映する
      otherUserDataStream.onData.add((args) => {
        // eslint-disable-next-line
        // console.log(args);  // デバッグ用
        setOtherUserWindowAndAudioAndParticipantsInfo(args as WindowAndAudioAndParticipantsInfo);
        // eslint-disable-next-line
        // console.log("bbb");  // デバッグ用
        // eslint-disable-next-line
        // console.log(args);  // デバッグ用
        // eslint-disable-next-line
        // console.log("対話相手のスクリーンの幅（送信後） = " + screenOtherWidth);  // デバッグ用
        // eslint-disable-next-line
        // console.log("対話相手のスクリーンの高さ（送信後） = " + screenOtherHeight);  // デバッグ用
        // eslint-disable-next-line
        // console.log("相手のデータを受信しました！");  // デバッグ用
        // eslint-disable-next-line
        // console.log(otherUserWindowAndAudioAndParticipantsInfo.width_inCaseOf_change);  // デバッグ用
      });
    }
  }, [ otherUserDataStream ]);

  // 計測開始時間の定義
  const [startTime_HeadDirection, setStartTime_HeadDirection] = useState<number>(0);
  const [startTime_Gaze, setStartTime_Gaze] = useState<number>(0);
  const [startTime_AudioAndParticipants, setStartTime_AudioAndParticipants] = useState<number>(0);
  const [startTime_Talk, setStartTime_Talk] = useState<number>(0);

  // CSVファイルへの頭部方向・音声データの情報のセット
  useEffect(() => {
      // eslint-disable-next-line
      // console.log(nowTest);  // デバッグ用
      if (otherUserDataStream != null) {
        if (nowTest) {
          const nowTime_HeadDirection = (performance.now() - startTime) / 1000;
          setHeadDirectionResults((prev) => [
            ...prev,
            { ID: participantID, condition: conditionID, startTime: startTime_HeadDirection, endTime: nowTime_HeadDirection, myTheta: myWindowAndAudioAndParticipantsInfo.theta, myWindowWidth: myWindowAndAudioAndParticipantsInfo.width_inCaseOf_change, otherTheta: otherUserWindowAndAudioAndParticipantsInfo.theta, otherWindowWidth: otherUserWindowAndAudioAndParticipantsInfo.width_inCaseOf_change }
          ]);
          setStartTime_HeadDirection(nowTime_HeadDirection);
          const nowTime_AudioAndParticipants = (performance.now() - startTime) / 1000;
          setAudioAndParticipantsResults((prev) => [
            ...prev,
            { ID: participantID, Condition: conditionID, startTime: startTime_AudioAndParticipants, endTime: nowTime_AudioAndParticipants, myStatus: myWindowAndAudioAndParticipantsInfo.status, myText: myWindowAndAudioAndParticipantsInfo.text, otherStatus: otherUserWindowAndAudioAndParticipantsInfo.status, otherText: otherUserWindowAndAudioAndParticipantsInfo.text }
          ]);
          setStartTime_AudioAndParticipants(nowTime_AudioAndParticipants);
        }
      }
  }, [ otherUserWindowAndAudioAndParticipantsInfo ]);

  // 話し手か否かの判定 + listeningがfalseになった時、trueにする
  const [isSpeaker, setIsSpeaker] = useState<boolean>(false);

  // useEffect(() => {
  //   if (otherUserDataStream != null && webSpeechAudio != null) {
  //     if (nowTest) {
  //       // eslint-disable-next-line
  //       console.log("transcript：" + webSpeechAudio.transcript);  // デバッグ用
  //       if (webSpeechAudio.transcript) {
  //         if(!isSpeaker) {
  //           setIsSpeaker(true);
  //           setStartTime_Talk((performance.now() - startTime) / 1000);  // 自分の発話開始
  //         }
  //       }
  //       else {
  //         setIsSpeaker(false);
  //       }

  //       // eslint-disable-next-line
  //       // console.log('SpeechRecognition is listening：' + webSpeechAudio.listening);  // デバッグ用
  //       // if (!webSpeechAudio.listening) {
  //       //   SpeechRecognition.startListening({
  //       //     continuous: true,
  //       //     language: 'ja'
  //       //   });
  //       // }

  //       // 発話が完全に終了したタイミングも書き出しておく（発話内容を後々見返せるようにするため）
  //       if (webSpeechAudio.finalTranscript) {
  //         const nowTime_Talk = (performance.now() - startTime) / 1000;
  //         setTalkResults((prev) => [
  //           ...prev,
  //           { ID: participantID, Condition: conditionID, startTime: startTime_Talk, endTime: nowTime_Talk, myStatus: isSpeaker, myText: webSpeechAudio.finalTranscript, otherStatus: otherUserWindowAndAudioAndParticipantsInfo.status, otherText: otherUserWindowAndAudioAndParticipantsInfo.text }
  //         ]);
  //       }
  //     }
  //   }
  // },[ otherUserWindowAndAudioAndParticipantsInfo, webSpeechAudio]);

  // listeningがfalseになった時、trueにする（飯塚さんのコード参照）
  // useEffect(() => {
  //   if (otherUserDataStream != null && webSpeechAudio != null) {
  //     if (nowTest) {
  //       SpeechRecognition.startListening({
  //         continuous: true,
  //         language: 'ja'
  //       });

  //       // 発話が完全に終了したタイミングも書き出しておく（発話内容を後々見返せるようにするため）
  //       if (webSpeechAudio.finalTranscript) {
  //         const nowTime_Talk = (performance.now() - startTime) / 1000;
  //         setTalkResults((prev) => [
  //           ...prev,
  //           { ID: participantID, Condition: conditionID, startTime: startTime_Talk, endTime: nowTime_Talk, myStatus: isSpeaker, myText: webSpeechAudio.finalTranscript, otherStatus: otherUserWindowAndAudioAndParticipantsInfo.status, otherText: otherUserWindowAndAudioAndParticipantsInfo.text }
  //         ]);
  //       }
  //     }
  //   }
  // },[webSpeechAudio.listening]);

  // // transcriptに値がある時、自分自身を話し手として判定する（飯塚さんのコード参照）
  // useEffect(() => {
  //   if (otherUserDataStream != null && webSpeechAudio != null) {
  //     if (nowTest) {
  //       // eslint-disable-next-line
  //       console.log("transcript：" + webSpeechAudio.transcript);  // デバッグ用
  //       if (webSpeechAudio.transcript) {
  //         // eslint-disable-next-line
  //         console.log("isSpeaker：" + isSpeaker);  // デバッグ用
  //         if(!isSpeaker) {
  //           setIsSpeaker(true);
  //           setStartTime_Talk((performance.now() - startTime) / 1000);  // 自分の発話開始
  //         }
  //       }
  //       else {
  //         setIsSpeaker(false);
  //       }
  //     }
  //   }
  // },[webSpeechAudio.transcript]);

  // ルームに入ることができるかの確認
  const canJoin = useMemo(() => {
    return participantID !== -1 && conditionID !== -1 && roomName !== "" && localStream != null && me == null;
  }, [participantID, conditionID, roomName, localStream, me]);

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
      // eslint-disable-next-line
      // console.log("published data stream");  // デバッグ用
      await me.publish(localDataStream);
    }

    // 自分以外の参加者情報を取得
    const otherPublifications = room.publications.filter(p => p.publisher.id !== me.id);
    setOtherUserPublications(otherPublifications);
    // eslint-disable-next-line
    // console.log(otherPublifications);  // デバッグ用
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

      // eslint-disable-next-line
      // console.log(e);  // デバッグ用
      if (e.publication.contentType === "data" && e.publication.publisher.id !== me.id) {
        // eslint-disable-next-line
        // console.log("DataStreamを購読しました！");  // デバッグ用
        const { stream } = await me.subscribe(e.publication.id);
        // ここは必ずRemoteDataStreamになるはず
        if (stream.contentType === "data") {
          // eslint-disable-next-line
          // console.log("!!!!!!!!!", stream);  // デバッグ用
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

  // CSVファイルに書き出すデータの計測開始・計測終了を制御する関数
  const testStart = () => {
    // 頭部方向の書き出し開始
    setHeadDirectionResults([
      { ID: participantID, condition: conditionID, startTime: 0, endTime:0, myTheta: 0, myWindowWidth: 0, otherTheta: 0, otherWindowWidth: 0 }
    ]);
    setStartTime_HeadDirection(0);

    // 視線の書き出し開始
    setGazeResults([
      { ID: participantID, condition: conditionID, startTime: 0, endTime: 0, myGazeX: 0, myGazeY: 0 }
    ]);
    setStartTime_Gaze(0);

    // 音声データ・参加者の状態（発話者か否か）の書き出し開始
    setAudioAndParticipantsResults([
      { ID: participantID, Condition: conditionID, startTime: 0, endTime: 0, myStatus: false, myText: "", otherStatus: false, otherText: "" }
    ]);
    setStartTime_AudioAndParticipants(0);

    // 会話の内容の書き出し開始
    setTalkResults([
      { ID: participantID, Condition: conditionID, startTime: 0, endTime: 0, myStatus: false, myText: "", otherStatus: false, otherText: "" }
    ]);
    setStartTime_Talk(0);

    // WebGazer.jsを用いた視線取得開始
    // const webgazer = (window as any).webgazer;
    // if (webgazer) {
    //   webgazer.setGazeListener((data: any, timestamp: number) => {
    //     if (data) {
    //       const nowTime_Gaze = (performance.now() - startTime) / 1000;
    //       setGazeResults((prev) => [
    //         ...prev,
    //         { ID: participantID, condition: conditionID, startTime: startTime_Gaze, endTime: nowTime_Gaze, myGazeX: data.x, myGazeY: data.y }
    //       ]);
    //       setStartTime_Gaze(nowTime_Gaze);  // (何故か更新されない...)
    //       // eslint-disable-next-line
    //       console.log(startTime_Gaze);  // デバッグ用
    //       // eslint-disable-next-line
    //       // console.log(`X: ${data.x}, Y: ${data.y}`);  // デバッグ用
    //     }
    //   });
    // }

    // if (!webSpeechAudio.browserSupportsSpeechRecognition) {
    //   // eslint-disable-next-line
    //   console.error("ブラウザが音声認識をサポートしていません。");  // デバッグ用
    // }

    // // SpeechRecognition.abortListening();  // 一旦音声リセット

    // // 音声認識の開始
    // // eslint-disable-next-line
    // // console.log(SpeechRecognition);  // デバッグ用
    // SpeechRecognition.startListening({ 
    //   continuous: true, 
    //   language: 'ja'
    // });

    startTime = performance.now();
    nowTest = true;
  }

  // データ計測終了
  const testEnd = () => {

    const webgazer = (window as any).webgazer;
    if (webgazer) {
      webgazer.setGazeListener((data: any, timestamp: number) => {});
    }

    nowTest = false;
    SpeechRecognition.stopListening();
    CSV_HeadDirection_Ref?.current?.link.click();
    CSV_Gaze_Ref?.current?.link.click();
    CSV_AudioAndParticipants_Ref?.current?.link.click();
    CSV_Talk_Ref?.current?.link.click();

    // CSVファイルに書き出すデータをコンソールにも出してみる
    // eslint-disable-next-line
    console.log(headDirectionResults);  // デバッグ用
    // eslint-disable-next-line
    console.log(gazeResults);  // デバッグ用
    // eslint-disable-next-line
    console.log(audioAndParticipantsResults);  // デバッグ用
    // eslint-disable-next-line
    console.log(talkResults);  // デバッグ用
  }
  
  return (
    <div>
      <div id="active-before-conference">
        <p>
        Your ID:
        <select id="ID" onChange={(event) => {
           participantID = Number(event.target.value);
        }}>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
          <option value="7">7</option>
          <option value="8">8</option>
          <option value="9">9</option>
          <option value="10">10</option>
          <option value="11">11</option>
          <option value="12">12</option>
          <option value="13">13</option>
          <option value="14">14</option>
          <option value="15">15</option>
          <option value="16">16</option>
          <option value="17">17</option>
          <option value="18">18</option>
          <option value="19">19</option>
          <option value="20">20</option>
        </select>
        &nbsp;&nbsp;
        condition=
        <select id="condition" onChange={(event) => { 
          conditionID = Number(event.target.value);
          switch(conditionID) {
            case 1:
              conditionName = "Baseline";
              break;
            case 2:
              conditionName = "FrameChange";
              break;
            case 3:
              conditionName = "SizeChange";
              break;
            case 4:
              conditionName = "PositionChange";
              break;
            case 5:
              conditionName = "PositionAndSizeChange";
              break;
            default:
              conditionName = "";
              break;
          }
        }}>
          <option value="1">Baseline</option>
          <option value="2">FrameChange</option>
          <option value="3">SizeChange</option>
          {/* <option value="4">PositionChange</option> */}          
          {/* <option value="5">PositionAndSizeChange</option> */}
        </select>
        &nbsp;&nbsp;
        room name: <input type="text" value={roomName} onChange={(e) => { roomName = e.target.value; }} />
        &nbsp;
        <button onClick={onJoinClick} disabled={!canJoin}>join</button>
        </p>
      </div>
      <div id="active-after-conference" className="non-active">
        ID: { participantID } &nbsp;&nbsp; condition: {conditionName} &nbsp;&nbsp; room name: {roomName}
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        <button onClick={testStart} disabled={nowTest}>Measurement Start</button>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        <button onClick={testEnd} disabled={!nowTest}>Measurement End</button>
      </div>
      <CSVLink data={headDirectionResults} filename={`C${conditionID}_ID${participantID}_headDirectionResults.csv`} ref={CSV_HeadDirection_Ref} ></CSVLink>
      <CSVLink data={gazeResults} filename={`C${conditionID}_ID${participantID}_gazeResults.csv`} ref={CSV_Gaze_Ref} ></CSVLink>
      <CSVLink data={audioAndParticipantsResults} filename={`C${conditionID}_ID${participantID}_audioAndParticipantsResults.csv`} ref={CSV_AudioAndParticipants_Ref} ></CSVLink>
      <CSVLink data={talkResults} filename={`C${conditionID}_ID${participantID}_talkResults.csv`} ref={CSV_Talk_Ref} ></CSVLink>
      {/* <div className="field-area" tabIndex={-1} onKeyDown={ onKeyDown }> */}
        <div className="icon-container">
          <video id="local-video" ref={localVideo} muted playsInline style={myWindowAndAudioContainerStyle}></video>
          <Webcam id="local-video" ref={webcamRef} muted playsInline style={myWindowAndAudioContainerStyle}/>
        </div>
        <div className="icon-container">
        {
          me != null && otherUserPublications.map(p => (
            <RemoteMedia id="remote-video" key={p.id} me={me} publication={p} style={otherUserWindowAndAudioContainerStyle}/>
          ))
        }
        </div>
      {/* </div> */}
    </div>
  )
}