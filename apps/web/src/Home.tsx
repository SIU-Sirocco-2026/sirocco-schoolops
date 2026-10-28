// SPDX-License-Identifier: Apache-2.0
import { useRef, useState } from "react";
import {
  IconArrowRight,
  IconArrowDown,
  IconTool,
  IconLeaf,
  IconShieldCheck,
  IconClipboardText,
  IconUsers,
  IconPhoto,
  IconCircleCheck,
  IconLock,
  IconHistory,
  IconPackage,
  IconServer,
} from "@tabler/icons-react";
import "./home.css";

const spaces = [
  {
    id: "facilities",
    name: "Cơ sở vật chất",
    icon: IconTool,
    title: "Sự cố được theo dõi đến khi hoàn tất.",
    description:
      "Từ máy chiếu đến phòng học, mỗi sự cố có người phụ trách và tiến độ rõ ràng.",
    actions: [
      "Ghi nhận phòng, thiết bị và ảnh",
      "Giao người xử lý, đặt thời hạn",
      "Kiểm tra bằng chứng, nghiệm thu kết quả",
    ],
    roles: "Người báo · Điều phối · Kỹ thuật · Nghiệm thu",
  },
  {
    id: "environment",
    name: "Môi trường",
    icon: IconLeaf,
    title: "Từ cảnh báo đến hành động cụ thể.",
    description:
      "Theo dõi PM2.5, xem nguồn số liệu và xác minh trước khi xử lý cảnh báo.",
    actions: [
      "Xem số đo và nguồn dữ liệu phát lại",
      "Xác minh, chọn phương án ứng phó",
      "Lưu bằng chứng trước khi đóng cảnh báo",
    ],
    roles: "Cán bộ môi trường · Nguồn phát lại",
  },
  {
    id: "safety",
    name: "An toàn",
    icon: IconShieldCheck,
    title: "Phối hợp xử lý trong đúng phạm vi.",
    description:
      "Phản ánh và trao đổi trên hồ sơ, chỉ hiển thị cho người được cấp quyền.",
    actions: [
      "Gửi phản ánh và theo dõi hồ sơ",
      "Phân công trong phạm vi được cấp quyền",
      "Kiểm tra kết quả và lịch sử truy cập",
    ],
    roles: "Người báo an toàn · Cán bộ phụ trách · Nghiệm thu",
  },
];
const stages = [
  {
    title: "Ghi nhận",
    role: "Người báo",
    icon: IconClipboardText,
    description: "Mô tả điều cần xử lý, thêm ảnh và giữ mã hồ sơ để theo dõi.",
  },
  {
    title: "Phân công",
    role: "Điều phối",
    icon: IconUsers,
    description:
      "Xác minh thông tin, giao người phụ trách và đặt hạn hoàn thành.",
  },
  {
    title: "Xử lý",
    role: "Kỹ thuật",
    icon: IconPhoto,
    description: "Cập nhật kết quả, kéo thả bằng chứng và gửi nghiệm thu.",
  },
  {
    title: "Nghiệm thu",
    role: "Người được giao",
    icon: IconCircleCheck,
    description: "Kiểm tra kết quả để đóng hồ sơ hoặc trả lại kèm lý do.",
  },
];

export function Home({
  ready,
  login,
  reconnect,
}: {
  ready: boolean;
  login: () => void;
  reconnect: () => void;
}) {
  const [space, setSpace] = useState(0);
  const [stage, setStage] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = spaces[space]!;
  const ModuleIcon = active.icon;
  return (
    <div className="home">
      <section className="welcome home-hero" aria-labelledby="home-title">
        <div className="home-intro">
          <span className="home-label">SchoolOps · Sirocco</span>
          <h1 id="home-title">
            Vận hành <span>trường học</span>
          </h1>
          <p className="home-lead">
            Ghi nhận dễ dàng.
            <br />
            Phối hợp rõ ràng. Theo dõi đến cùng.
          </p>
          <div className="home-actions">
            <button
              className="button primary home-login"
              disabled={!ready}
              onClick={login}
            >
              Đăng nhập vào SchoolOps{" "}
              <IconArrowRight size={19} aria-hidden="true" />
            </button>
            <a className="home-explore" href="#home-spaces">
              Khám phá tính năng <IconArrowDown size={17} aria-hidden="true" />
            </a>
          </div>
          {!ready && (
            <button className="button secondary" onClick={reconnect}>
              Kết nối lại
            </button>
          )}
          <p className="home-account-note">
            <IconLock size={15} aria-hidden="true" /> Dùng tài khoản được cấp để
            vào đúng không gian của bạn.
          </p>
        </div>
        <div className="home-flow" aria-label="Minh họa quy trình phối hợp">
          <div className="home-flow-heading">
            <strong>Từ phản ánh đến hoàn tất</strong>
            <span>Minh họa quy trình</span>
          </div>
          <div className="home-stage-list" aria-label="Các bước minh họa">
            {stages.map((item, index) => {
              const StageIcon = item.icon;
              return (
                <button
                  type="button"
                  className="home-stage"
                  key={item.title}
                  aria-pressed={stage === index}
                  onClick={() => setStage(index)}
                >
                  <span className="home-stage-icon">
                    <StageIcon size={23} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.role}</small>
                  </span>
                  <IconArrowRight
                    className="home-stage-arrow"
                    size={18}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
          <div
            className="home-stage-description"
            aria-live="polite"
            aria-atomic="true"
          >
            <p key={stage}>{stages[stage]!.description}</p>
          </div>
        </div>
      </section>

      <section
        className="home-spaces"
        id="home-spaces"
        aria-labelledby="home-spaces-title"
      >
        <div className="home-section-heading">
          <h2 id="home-spaces-title">Bạn cần xử lý điều gì?</h2>
          <p>Chọn một không gian để khám phá.</p>
        </div>
        <div
          role="tablist"
          aria-label="Khám phá không gian"
          className="home-space-tabs"
        >
          {spaces.map((item, index) => {
            const SpaceIcon = item.icon;
            return (
              <button
                type="button"
                role="tab"
                key={item.id}
                id={`home-tab-${item.id}`}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                aria-selected={space === index}
                aria-controls={`home-panel-${item.id}`}
                tabIndex={space === index ? 0 : -1}
                onClick={() => setSpace(index)}
                onKeyDown={(event) => {
                  let next: number;
                  if (event.key === "ArrowRight")
                    next = (index + 1) % spaces.length;
                  else if (event.key === "ArrowLeft")
                    next = (index + spaces.length - 1) % spaces.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = spaces.length - 1;
                  else return;
                  event.preventDefault();
                  setSpace(next);
                  tabs.current[next]?.focus();
                }}
              >
                <SpaceIcon size={22} aria-hidden="true" />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
        {spaces.map((item, index) => (
          <div
            role="tabpanel"
            tabIndex={0}
            key={item.id}
            id={`home-panel-${item.id}`}
            aria-labelledby={`home-tab-${item.id}`}
            hidden={space !== index}
            className="home-space-panel"
          >
            <div className="home-space-copy">
              <span className="home-module-icon">
                <ModuleIcon size={32} aria-hidden="true" />
              </span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <small>{item.roles}</small>
            </div>
            <ol className="home-capabilities">
              {item.actions.map((action, i) => (
                <li key={action}>
                  <span>{i + 1}</span>
                  <strong>{action}</strong>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <section className="home-principles" aria-label="Theo dõi công việc">
        <div>
          <IconUsers size={22} aria-hidden="true" />
          <h3>Rõ người phụ trách</h3>
          <p>Biết ai đang xử lý và bước tiếp theo.</p>
        </div>
        <div>
          <IconPhoto size={22} aria-hidden="true" />
          <h3>Có bằng chứng</h3>
          <p>Xem trước ảnh, kéo thả tệp và kiểm tra kết quả.</p>
        </div>
        <div>
          <IconHistory size={22} aria-hidden="true" />
          <h3>Theo dõi được lịch sử</h3>
          <p>Giữ các lần cập nhật trên cùng một hồ sơ.</p>
        </div>
      </section>
      <details className="home-access" id="home-access">
        <summary>Chọn vai trò và bắt đầu như thế nào?</summary>
        <div className="home-access-content">
          <p>
            Đăng nhập bằng tài khoản được cấp. SchoolOps mở không gian theo vai
            trò; các hồ sơ và thao tác hiển thị theo quyền của bạn.
          </p>
          <div>
            <IconPackage size={22} aria-hidden="true" />
            <span>
              <strong>Quản trị gói</strong>
              <small>
                Quản trị kỹ thuật kiểm tra phiên bản và lịch sử gói nghiệp vụ.
              </small>
            </span>
          </div>
          <div>
            <IconServer size={22} aria-hidden="true" />
            <span>
              <strong>Kiểm tra nền tảng</strong>
              <small>
                Mở Công cụ kiểm tra để thử kết nối và luồng nhiệm vụ demo.
              </small>
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}
