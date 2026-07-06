# Admin Permissions Matrix

All actions below are gated by authenticated sessions. Some screens allow `admin` only, while moderation controls also accept `moderator` where the code does so.

```text
+-----------------------------+-----------------------------------------------+--------------------------------------------------------------+
| Screen                      | Actions                                       | Endpoint                                                     |
+-----------------------------+-----------------------------------------------+--------------------------------------------------------------+
| Project > AI Provider Admin | List, create, edit, delete, test, set default | GET/POST /api/admin/ai/providers                            |
|                             |                                               | GET/PATCH/DELETE /api/admin/ai/providers/:id                |
|                             |                                               | POST /api/admin/ai/providers/:id/test                       |
|                             |                                               | POST /api/admin/ai/providers/:id/set-default                |
+-----------------------------+-----------------------------------------------+--------------------------------------------------------------+
| Explore > Project Details   | Approve/unapprove project, approve/unapprove  | WS messages: set_project_approved, set_user_approved        |
|                             | user, edit project tags                        | WS message: set_project_tags                                |
+-----------------------------+-----------------------------------------------+--------------------------------------------------------------+
| Forum > Category/Post Views  | Create/edit category, edit post/reply, view   | WS messages: create_forum_category, edit_forum_category     |
|                             | raw post/reply data, move or delete content    | edit_forum_post, edit_forum_reply, get_raw_post, get_raw_reply |
+-----------------------------+-----------------------------------------------+--------------------------------------------------------------+
```

