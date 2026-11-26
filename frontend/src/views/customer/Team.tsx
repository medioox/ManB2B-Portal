"use client";
import React, { useState } from "react";
import { Button, Card, ConfirmButton, Empty, Field, Input, Loading, Modal, PageHeader, StatusChip, Table, useAction } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fa } from "@/lib/format";
import { useApi } from "@/lib/hooks";

export default function Team() {
  const { data, loading, reload } = useApi<any[]>("/sub-users/");
  const [edit, setEdit] = useState<any | null>(null);
  const { run, busy } = useAction();
  const [err, setErr] = useState<string>();
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(undefined);
    try {
      if (edit.id) await api.patch(`/sub-users/${edit.id}/`, edit);
      else await api.post("/sub-users/", edit);
      setEdit(null); reload();
    } catch (e2) { setErr((e2 as ApiError).field("phone") || (e2 as ApiError).message); }
  };
  return (
    <>
      <PageHeader title="کاربران شرکت" subtitle="برای حسابدار، انباردار یا کارمندان خود دسترسی جدا تعریف کنید. هر کاربر با موبایل خودش وارد می‌شود."
        actions={<Button icon="plus" onClick={() => setEdit({ phone: "", first_name: "", last_name: "", job_title: "", can_order: true, can_view_finance: false })}>کاربر جدید</Button>} />
      <Card pad={false}>
        {loading ? <Loading /> : !data?.length ? <Empty icon="users" title="هنوز زیرکاربری تعریف نکرده‌اید" text="مثلاً حسابدارتان می‌تواند فقط بخش مالی را ببیند و سفارش ثبت نکند." /> : (
          <div className="px-5 pt-2"><Table>
            <thead><tr><th className="th">نام</th><th className="th">سمت</th><th className="th">موبایل</th><th className="th">ثبت سفارش</th><th className="th">بخش مالی</th><th className="th">وضعیت</th><th className="th"></th></tr></thead>
            <tbody>{data.map((u) => (
              <tr key={u.id}>
                <td className="td">{u.first_name} {u.last_name}</td><td className="td">{u.job_title || "—"}</td><td className="td num" dir="ltr">{fa(u.phone)}</td>
                <td className="td">{u.can_order ? "✓" : "—"}</td><td className="td">{u.can_view_finance ? "✓" : "—"}</td>
                <td className="td"><StatusChip status={u.is_active ? "approved" : "suspended"} label={u.is_active ? "فعال" : "غیرفعال"} /></td>
                <td className="td text-left whitespace-nowrap">
                  <Button variant="ghost" size="sm" icon="edit" onClick={() => setEdit(u)}>ویرایش</Button>
                  {u.is_active && <ConfirmButton variant="ghost" size="sm" icon="x" confirmText="غیرفعال شود؟" onConfirm={async () => { await run(() => api.del(`/sub-users/${u.id}/`), "کاربر غیرفعال شد"); reload(); }}>غیرفعال</ConfirmButton>}
                </td>
              </tr>
            ))}</tbody>
          </Table></div>
        )}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "ویرایش کاربر" : "کاربر جدید"}>
        {edit && (
          <form onSubmit={save} className="grid grid-cols-2 gap-4">
            <Field label="نام"><Input id="su_fn" required value={edit.first_name} onChange={(e) => setEdit({ ...edit, first_name: e.target.value })} /></Field>
            <Field label="نام خانوادگی"><Input id="su_ln" required value={edit.last_name} onChange={(e) => setEdit({ ...edit, last_name: e.target.value })} /></Field>
            <Field label="موبایل" error={err}><Input id="su_ph" required dir="ltr" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="سمت"><Input id="su_job" value={edit.job_title} onChange={(e) => setEdit({ ...edit, job_title: e.target.value })} placeholder="حسابدار" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.can_order} onChange={(e) => setEdit({ ...edit, can_order: e.target.checked })} />اجازه‌ی ثبت سفارش</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.can_view_finance} onChange={(e) => setEdit({ ...edit, can_view_finance: e.target.checked })} />دسترسی به بخش مالی</label>
            {edit.id && <label className="flex items-center gap-2 text-sm col-span-2"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />فعال</label>}
            <Button className="col-span-2" loading={busy}>ذخیره</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
