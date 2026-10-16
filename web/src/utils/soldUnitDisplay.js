export const CONDITION_ORDER = ['new', 'new_no_box', 'grade_a_plus', 'grade_a', 'grade_b', 'grade_c'];

export function conditionBadge(condition) {
  return (
    {
      new: 'bg-emerald-100 text-emerald-700',
      new_no_box: 'bg-green-100 text-green-700',
      grade_a_plus: 'bg-lime-100 text-lime-700',
      grade_a: 'bg-blue-100 text-blue-700',
      grade_b: 'bg-yellow-100 text-yellow-700',
      grade_c: 'bg-orange-100 text-orange-700',
    }[condition] || 'bg-gray-100 text-gray-700'
  );
}

export const isComputerUnit = (u) => u.deviceType === 'laptop' || u.deviceType === 'macbook';
