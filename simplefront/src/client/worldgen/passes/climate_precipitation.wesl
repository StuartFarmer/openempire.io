import package::bindings::precipitation;
import package::passes::climate::precipitationAt;

fn tile(x: i32, y: i32, i: u32) {
  precipitation[i] = precipitationAt(x, y, i);
}
