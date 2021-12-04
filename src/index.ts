// 環境変数、未設定なら例外処理
if (!process.env.ANNICT_TOKEN || process.env.ANNICT_TOKEN.length <= 0)
  throw new Error("ANNICT_TOKEN が設定されていません");

if (!process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL.length <= 0)
  throw new Error("DISCORD_WEBHOOK_URL が設定されていません");

if (!process.env.CRON || process.env.CRON.length <= 0)
  throw new Error("CRON が設定されていません");

// 念のため、タイムゾーン設定
process.env.TZ = "Asia/Tokyo";

import { CronJob } from "cron";
import { MessageEmbed, WebhookClient } from "discord.js";
import got from "got";
import moment from "moment";

/**
 * チャンネル情報
 */
interface Channel {
  id: number;
  name: string;
}

/**
 * 作品情報
 */
interface Facebook {
  og_image_url: string;
}

interface Twitter {
  mini_avatar_url: string;
  normal_avatar_url: string;
  bigger_avatar_url: string;
  original_avatar_url: string;
  image_url: string;
}

interface Images {
  recommended_url: string;
  facebook: Facebook;
  twitter: Twitter;
}

interface Work {
  id: number;
  title: string;
  title_kana: string;
  media: string;
  media_text: string;
  season_name: string;
  season_name_text: string;
  released_on: string;
  released_on_about: string;
  official_site_url: string;
  wikipedia_url: string;
  twitter_username: string;
  twitter_hashtag: string;
  syobocal_tid: string;
  mal_anime_id: string;
  images: Images;
  episodes_count: number;
  watchers_count: number;
}

/**
 * エピソード情報
 */
interface Episode {
  id: number;
  number: string;
  number_text: string;
  sort_number: number;
  title: string;
  records_count: number;
  record_comments_count: number;
}

/**
 * 放送予定 定義インターフェース
 */
interface IProgram {
  notify(): void;
  id: number;
  started_at: string;
  is_rebroadcast: boolean;
  channel: Channel;
  work: Work;
  episode: Episode;
}

const cron = process.env.CRON

const tz = process.env.TZ

// Annict Endpoint
const annictApiEndpoint = "https://api.annict.com/v1" as const;

// Annict Access Token
const annictToken = process.env.ANNICT_TOKEN;

// Discord Webhook Url
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

// 通知クライアント
const notifier = new WebhookClient({ url: discordWebhookUrl });

/**
 * 放送予定 定義クラス
 */
class Program implements IProgram {
  id: number;
  started_at: string;
  is_rebroadcast: boolean;
  channel: Channel;
  work: Work;
  episode: Episode;

  constructor(
    id: number,
    started_at: string,
    is_rebroadcast: boolean,
    channel: Channel,
    work: Work,
    episode: Episode
  ) {
    this.id = id;
    this.started_at = started_at;
    this.is_rebroadcast = is_rebroadcast;
    this.channel = channel;
    this.work = work;
    this.episode = episode;
  }

  /**
   * Discord に通知します
   * @returns
   */
  async notify() {
    return await notifier.send({
      username: this.work.title,
      avatarURL: this.work.images.recommended_url,
      embeds: [
        new MessageEmbed()
          .setTitle(
            `${this.work.title} ${this.episode.number_text} ${this.episode.title}`
          )
          .setImage(this.work.images.recommended_url)
          .addFields([
            {
              name: "チャンネル",
              value: this.channel.name,
              inline: false,
            },
            {
              name: "放送開始時間",
              value: moment(new Date(this.started_at)).format(
                "YYYY/MM/DD HH:mm"
              ),
              inline: false,
            },
            {
              name: "時期",
              value: this.work.season_name_text,
              inline: false,
            },
            {
              name: "Twittter ハッシュタグ",
              value: `#${this.work.twitter_hashtag}`,
              inline: false,
            },
            {
              name: "Twittter",
              value: `https://twitter.com/${this.work.twitter_username}`,
              inline: false,
            },
            {
              name: "公式サイト",
              value: this.work.official_site_url,
              inline: false,
            },
            {
              name: "しょぼいカレンダー",
              value: `http://cal.syoboi.jp/tid/${this.work.syobocal_tid}`,
              inline: false,
            },
            {
              name: "MyAnimeList",
              value: `https://myanimelist.net/anime/${this.work.mal_anime_id}`,
              inline: false,
            },
            {
              name: "再放送",
              value: this.is_rebroadcast ? "はい" : "いいえ",
              inline: false,
            },
          ]),
      ],
    });
  }
}

/**
 * 放送予定情報 レスポンス
 */
interface ProgramsResponseObject {
  programs: IProgram[];
  total_count: number;
  next_page: number | null;
  prev_page: number | null;
}

/**
 * 今日の日付を文字列で返します
 * @returns string
 */
const getTodayDateAsString = () => moment().format("YYYY-MM-DD")

/**
 * 指定された日付が今日かを返します
 * @param someDate
 * @returns boolean
 */
const isToday = (date: Date) => {
  const today = new Date();
  return (
    date.getDate() == today.getDate() &&
    date.getMonth() == today.getMonth() &&
    date.getFullYear() == today.getFullYear()
  );
};

/**
 * 今日以降の放送予定を取得します
 * @returns
 */
const getPrograms = async () => {
  const target = new URL(`${annictApiEndpoint}/me/programs`);
  target.searchParams.set("filter_unwatched", "true"); // 未視聴の放送予定だけを取得
  target.searchParams.set("sort_started_at", "desc");
  target.searchParams.set("filter_started_at_lt", getTodayDateAsString());
  target.searchParams.set("per_page", "50");

  return await got<ProgramsResponseObject | null>(target.href, {
    responseType: "json",
    headers: {
      Authorization: `Bearer ${annictToken}`,
    },
  }).json<ProgramsResponseObject | null>();
};


/**
 * 放送予定を取得し、通知する
 */
const execute = () => getPrograms().then((res) => {
  if (!res || !res.programs || res.programs.length <= 0) return;

  // レスポンス ログ
  console.info(res);

  // 今日の放送予定をフィルターして通知
  res.programs
    .filter(
      (program) =>
        program.episode &&
        program.started_at &&
        isToday(new Date(program.started_at))
    )
    .map(async (program, i) => {
      // エピソード情報が存在する場合のみ通知
      if (program.episode) {
        await new Program(
          program.id,
          program.started_at,
          program.is_rebroadcast,
          program.channel,
          program.work,
          program.episode
        ).notify();
      }
    });
});

// Run
new CronJob(
  cron,
  () => {
    try {
      execute()
    } catch (e) {
      console.error(e);
    }
  },
  null,
  false,
  tz
).start()